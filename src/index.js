import "dotenv/config";
import crypto from "crypto";
import express from "express";
import helmet from "helmet";

const app = express();

// Notification request headers
const TWITCH_MESSAGE_ID = "Twitch-Eventsub-Message-Id".toLowerCase();
const TWITCH_MESSAGE_TIMESTAMP =
  "Twitch-Eventsub-Message-Timestamp".toLowerCase();
const TWITCH_MESSAGE_SIGNATURE =
  "Twitch-Eventsub-Message-Signature".toLowerCase();
const MESSAGE_TYPE = "Twitch-Eventsub-Message-Type".toLowerCase();

// Notification message types
const MESSAGE_TYPE_VERIFICATION = "webhook_callback_verification";
const MESSAGE_TYPE_NOTIFICATION = "notification";
const MESSAGE_TYPE_REVOCATION = "revocation";

// Prepend this string to the HMAC that's created from the message
const HMAC_PREFIX = "sha256=";

let token = {
  access_token: null,
  expires_in: null,
  token_type: null,
  user: null,
};

app.use(helmet());

app.use(
  express.raw({
    type: "application/json",
  }),
);

app.get("/", (req, res) =>
  res.send("Twitch Unban Requests EventSub Webhook Endpoint"),
);

app.post("/", async (req, res) => {
  let secret = process.env.EVENTSUB_SECRET;
  let message =
    req.headers[TWITCH_MESSAGE_ID] +
    req.headers[TWITCH_MESSAGE_TIMESTAMP] +
    req.body;
  let hmac =
    HMAC_PREFIX +
    crypto.createHmac("sha256", secret).update(message).digest("hex");

  if (verifyMessage(hmac, req.headers[TWITCH_MESSAGE_SIGNATURE])) {
    // Get JSON object from body, so you can process the message.
    let notification = JSON.parse(req.body);
    switch (req.headers[MESSAGE_TYPE]) {
      case MESSAGE_TYPE_NOTIFICATION:
        if (notification.subscription.type == "channel.unban_request.create") {
          let discordPayload = {
            embeds: [
              {
                color: 0xcc3333, // red
                title: notification.event.id
                  ? `Unban Request ${notification.event.id}`
                  : "Unban Request",
                fields: [
                  {
                    name: "Broadcaster",
                    value: `[\`${notification.event.broadcaster_user_name}\` (\`${notification.event.broadcaster_user_login}\` - \`${notification.event.broadcaster_user_id}\`)](<https://www.twitch.tv/${notification.event.broadcaster_user_login}>)`,
                    inline: false,
                  },
                  {
                    name: "User",
                    value: `[\`${notification.event.user_name}\` (\`${notification.event.user_login}\` - \`${notification.event.user_id}\`)](<https://www.twitch.tv/${notification.event.user_login}>)`,
                    inline: false,
                  },
                  {
                    name: "Created at",
                    value: `<t:${Math.floor(Date.parse(notification.event.created_at) / 1000)}:F>`,
                    inline: false,
                  },
                ],
                description: `\`\`\`${notification.event.text}\`\`\``,
              },
            ],
          };
          console.log(JSON.stringify(discordPayload, null, 4));
          let webhookUrl = `${process.env.DISCORD_WEBHOOK_URL}?wait=true`;
          if (process.env.THREAD_ID && process.env.THREAD_ID != "") {
            webhookUrl += `&thread_id=${process.env.THREAD_ID}`;
          }
          let discordResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(discordPayload),
          }).then((res) => res.text());
          console.log(JSON.stringify(discordResponse, null, 4));
        } else if (
          notification.subscription.type == "channel.unban_request.resolve"
        ) {
          if (!notification.event.status) {
            res.sendStatus(204);
            break;
          }
          let discordPayload = {
            embeds: [
              {
                color: 0xaaff00, // green
                title: notification.event.id
                  ? `Unban Request ${notification.event.id} ${notification.event.status}`
                  : `Unban Request ${notification.event.status}`,
                fields: [
                  {
                    name: "Broadcaster",
                    value: `[\`${notification.event.broadcaster_user_name}\` (\`${notification.event.broadcaster_user_login}\` - \`${notification.event.broadcaster_user_id}\`)](<https://www.twitch.tv/${notification.event.broadcaster_user_login}>)`,
                    inline: false,
                  },
                  {
                    name: "Moderator",
                    value: `[\`${notification.event.moderator_user_name}\` (\`${notification.event.moderator_user_login}\` - \`${notification.event.moderator_user_id}\`)](<https://www.twitch.tv/${notification.event.moderator_user_login}>)`,
                    inline: false,
                  },
                  {
                    name: "User",
                    value: `[\`${notification.event.user_name}\` (\`${notification.event.user_login}\` - \`${notification.event.user_id}\`)](<https://www.twitch.tv/${notification.event.user_login}>)`,
                    inline: false,
                  },
                ],
                description: `**Status: \`${notification.event.status}\`**\n**Resolution Text:**\n\`\`\`${notification.event.resolution_text}\`\`\``,
              },
            ],
          };
          console.log(JSON.stringify(discordPayload, null, 4));
          let webhookUrl = `${process.env.DISCORD_WEBHOOK_URL}?wait=true`;
          if (process.env.THREAD_ID && process.env.THREAD_ID != "") {
            webhookUrl += `&thread_id=${process.env.THREAD_ID}`;
          }
          let discordResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(discordPayload),
          }).then((res) => res.text());
          console.log(JSON.stringify(discordResponse, null, 4));
        } else {
          console.log(`Event type: ${notification.subscription.type}`);
          console.log(JSON.stringify(notification.event, null, 4));
        }
        res.sendStatus(204);
        break;
      case MESSAGE_TYPE_VERIFICATION:
        res
          .set("Content-Type", "text/plain")
          .status(200)
          .send(notification.challenge);
        break;
      case MESSAGE_TYPE_REVOCATION:
        res.sendStatus(204);
        console.log(`${notification.subscription.type} notifications revoked!`);
        console.log(`reason: ${notification.subscription.status}`);
        console.log(
          `condition: ${JSON.stringify(notification.subscription.condition, null, 4)}`,
        );
        break;
      default:
        res.sendStatus(204);
        console.log(`Unknown message type: ${req.headers[MESSAGE_TYPE]}`);
        break;
    }
  } else {
    console.log("403 - Signatures didn't match.");
    res.sendStatus(403);
  }
});

function verifyMessage(hmac, verifySignature) {
  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(verifySignature),
  );
}

const port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`Server ready on port ${port}.`);
});
