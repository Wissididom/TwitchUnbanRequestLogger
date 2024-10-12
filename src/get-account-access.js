import "dotenv/config";

async function getUser(clientId, accessToken) {
  let userResponse = await fetch(`https://api.twitch.tv/helix/users`, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  }).then((res) => res.json());
  return userResponse.data[0];
}

async function getAccountAccess(manage) {
  let scopes;
  if (manage) {
    scopes = encodeURIComponent(["moderator:manage:unban_requests"].join(" "));
  } else {
    scopes = encodeURIComponent(["moderator:read:unban_requests"].join(" "));
  }
  let tokens = {
    access_token: null,
    refresh_token: null,
    device_code: null,
    verification_uri: null,
    user_id: null,
  };
  let dcf = await fetch(
    `https://id.twitch.tv/oauth2/device?client_id=${process.env.TWITCH_CLIENT_ID}&scopes=${scopes}`,
    {
      method: "POST",
    },
  );
  if (dcf.status >= 200 && dcf.status < 300) {
    // Successfully got DCF data
    let dcfJson = await dcf.json();
    tokens.device_code = dcfJson.device_code;
    tokens.user_code = dcfJson.user_code;
    tokens.verification_uri = dcfJson.verification_uri;
    console.log(
      `Open ${tokens.verification_uri} in a browser and enter ${tokens.user_code} there!`,
    );
  }
  let dcfInterval = setInterval(async () => {
    let tokenResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&scopes=${encodeURIComponent(scopes)}&device_code=${tokens.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`,
      {
        method: "POST",
      },
    );
    if (tokenResponse.status == 400) return; // Probably authorization pending
    if (tokenResponse.status >= 200 && tokenResponse.status < 300) {
      // Successfully got token
      let tokenJson = await tokenResponse.json();
      tokens.access_token = tokenJson.access_token;
      tokens.refresh_token = tokenJson.refresh_token;
      let user = await getUser(
        process.env.TWITCH_CLIENT_ID,
        tokens.access_token,
      );
      clearInterval(dcfInterval);
      console.log(
        `Got Device Code Flow Tokens for User ${user.display_name} (${user.login})`,
      );
    }
  }, 1000);
}

await getAccountAccess(false);
