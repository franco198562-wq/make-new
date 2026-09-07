const OWNER_ID = '1334272703347294210';

const PERMISSIONS = [
  'view_books',
  'create_books',
  'edit_books',
  'delete_books',
  'manage_departments',
  'manage_users',
  'manage_settings'
];

const COOKIE_NAME = 'pmb_session';
const SESSION_DAYS = 7;

function json(data, status = 200, request) {
  const origin = new URL(request.url).origin;

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function redirect(url, cookies = []) {
  const headers = {
    Location: url
  };

  if (cookies.length) {
    headers['Set-Cookie'] = cookies;
  }

  return new Response(null, {
    status: 302,
    headers
  });
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';

  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');

    if (key === name) {
      return value.join('=');
    }
  }

  return null;
}

function makeSessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function getSession(request, env) {
  const token = getCookie(request, COOKIE_NAME);

  if (!token) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  const result = await env.DB
    .prepare(`
      SELECT
        s.token,
        s.discord_id,
        s.expires_at,
        u.username,
        u.avatar
      FROM sessions s
      LEFT JOIN users u
        ON u.discord_id = s.discord_id
      WHERE s.token = ?
        AND s.expires_at > ?
    `)
    .bind(token, now)
    .first();

  return result || null;
}

async function getPermissions(user, env) {
  if (!user) {
    return [];
  }

  if (user.discord_id === OWNER_ID) {
    return [...PERMISSIONS];
  }

  try {
    const result = await env.DB
      .prepare(`
        SELECT DISTINCT rp.permission
        FROM role_permissions rp
        INNER JOIN user_roles ur
          ON ur.role_id = rp.role_id
        WHERE ur.discord_id = ?
      `)
      .bind(user.discord_id)
      .all();

    return (result.results || []).map(
      row => row.permission
    );
  } catch (error) {
    console.error('Permission lookup failed:', error);
    return [];
  }
}

function can(user, permissions, permission) {
  return (
    user &&
    (
      user.discord_id === OWNER_ID ||
      permissions.includes(permission)
    )
  );
}

async function discordAPI(path, env, options = {}) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      ...(options.headers || {})
    }
  });
}

async function updateDiscordRoles(userId, env) {
  /*
   * DISCORD_GUILD_ID should be the ID of your Discord server.
   * The bot must be in that server.
   */
  if (!env.DISCORD_GUILD_ID) {
    console.error('DISCORD_GUILD_ID is missing.');
    return;
  }

  const response = await discordAPI(
    `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,
    env
  );

  if (!response.ok) {
    console.error(
      'Could not retrieve Discord member:',
      response.status
    );
    return;
  }

  const member = await response.json();

  await env.DB
    .prepare(`
      DELETE FROM user_roles
      WHERE discord_id = ?
    `)
    .bind(userId)
    .run();

  for (const roleId of member.roles || []) {
    await env.DB
      .prepare(`
        INSERT OR IGNORE INTO user_roles
          (discord_id, role_id)
        VALUES (?, ?)
      `)
      .bind(userId, roleId)
      .run();
  }
}

async function getDiscordRoles(env) {
  if (!env.DISCORD_GUILD_ID) {
    return [];
  }

  const response = await discordAPI(
    `/guilds/${env.DISCORD_GUILD_ID}/roles`,
    env
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': url.origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods':
            'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    /*
     * DISCORD LOGIN
     */
    if (url.pathname === '/api/auth/login') {
      const discordURL =
        'https://discord.com/oauth2/authorize' +
        `?client_id=${encodeURIComponent(env.DISCORD_CLIENT_ID)}` +
        '&response_type=code' +
        `&redirect_uri=${encodeURIComponent(env.DISCORD_REDIRECT_URI)}` +
        '&scope=identify%20guilds';

      return redirect(discordURL);
    }

    /*
     * DISCORD CALLBACK
     */
    if (url.pathname === '/api/auth/callback') {
      try {
        const code = url.searchParams.get('code');

        if (!code) {
          return redirect('/?login=failed');
        }

        const tokenResponse = await fetch(
          'https://discord.com/api/oauth2/token',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              client_id: env.DISCORD_CLIENT_ID,
              client_secret: env.DISCORD_CLIENT_SECRET,
              grant_type: 'authorization_code',
              code,
              redirect_uri: env.DISCORD_REDIRECT_URI
            })
          }
        );

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenData.access_token) {
          console.error(
            'Discord OAuth token error:',
            JSON.stringify(tokenData)
          );

          return redirect('/?login=failed');
        }

        const userResponse = await fetch(
          'https://discord.com/api/users/@me',
          {
            headers: {
              Authorization:
                `Bearer ${tokenData.access_token}`
            }
          }
        );

        const discordUser = await userResponse.json();

        if (!userResponse.ok || !discordUser.id) {
          console.error(
            'Discord user lookup failed:',
            JSON.stringify(discordUser)
          );

          return redirect('/?login=failed');
        }

        const now = Math.floor(Date.now() / 1000);
        const sessionToken = crypto.randomUUID();

        await env.DB
          .prepare(`
            INSERT INTO users
              (discord_id, username, avatar, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(discord_id)
            DO UPDATE SET
              username = excluded.username,
              avatar = excluded.avatar,
              updated_at = excluded.updated_at
          `)
          .bind(
            discordUser.id,
            discordUser.username || 'Unknown User',
            discordUser.avatar || '',
            now
          )
          .run();

        await env.DB
          .prepare(`
            INSERT INTO sessions
              (token, discord_id, expires_at)
            VALUES (?, ?, ?)
          `)
          .bind(
            sessionToken,
            discordUser.id,
            now + SESSION_DAYS * 86400
          )
          .run();

        /*
         * This is deliberately separate from OAuth.
         * OAuth logs the user in first.
         * The bot then checks the user's roles.
         */
        try {
          await updateDiscordRoles(
            discordUser.id,
            env
          );
        } catch (roleError) {
          console.error(
            'Discord role sync failed:',
            roleError
          );
        }

        return redirect('/', [
          makeSessionCookie(sessionToken)
        ]);
      } catch (error) {
        console.error(
          'Discord callback exception:',
          error
        );

        return redirect('/?login=failed');
      }
    }

    /*
     * LOGOUT
     */
    if (url.pathname === '/api/auth/logout') {
      const token = getCookie(request, COOKIE_NAME);

      if (token) {
        await env.DB
          .prepare(`
            DELETE FROM sessions
            WHERE token = ?
          `)
          .bind(token)
          .run();
      }

      return redirect('/', [
        clearSessionCookie()
      ]);
    }

    /*
     * CURRENT USER
     */
    if (url.pathname === '/api/me') {
      const user = await getSession(request, env);
      const permissions = await getPermissions(user, env);

      return json({
        loggedIn: Boolean(user),
        user: user
          ? {
              discord_id: user.discord_id,
              username: user.username,
              avatar: user.avatar
            }
          : null,
        permissions
      }, 200, request);
    }

    /*
     * ALL OTHER API ROUTES REQUIRE LOGIN
     */
    if (url.pathname.startsWith('/api/')) {
      const user = await getSession(request, env);

      if (!user) {
        return json({
          error: 'Login required'
        }, 401, request);
      }

      const permissions = await getPermissions(user, env);

      /*
       * SHARED DATA
       *
       * Uses the original site_data table.
       */
      if (url.pathname === '/api/data') {
        if (request.method === 'GET') {
          if (!can(user, permissions, 'view_books')) {
            return json({
              error: 'You do not have permission to view books.'
            }, 403, request);
          }

          const row = await env.DB
            .prepare(`
              SELECT data
              FROM site_data
              WHERE id = 1
            `)
            .first();

          return json(
            row
              ? JSON.parse(row.data)
              : {
                  departments: [],
                  books: []
                },
            200,
            request
          );
        }

        if (request.method === 'PUT') {
          if (!can(user, permissions, 'edit_books')) {
            return json({
              error: 'You do not have permission to edit books.'
            }, 403, request);
          }

          const data = await request.json();

          await env.DB
            .prepare(`
              INSERT INTO site_data
                (id, data, updated_at)
              VALUES (1, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id)
              DO UPDATE SET
                data = excluded.data,
                updated_at = CURRENT_TIMESTAMP
            `)
            .bind(JSON.stringify(data))
            .run();

          return json({
            ok: true
          }, 200, request);
        }
      }

      /*
       * DISCORD ROLES
       */
      if (
        url.pathname === '/api/discord/roles' &&
        request.method === 'GET'
      ) {
        if (!can(user, permissions, 'manage_users')) {
          return json({
            error: 'You do not have permission to manage users.'
          }, 403, request);
        }

        const roles = await getDiscordRoles(env);

        return json(roles, 200, request);
      }

      /*
       * SAVED ROLE PERMISSIONS
       */
      if (
        url.pathname === '/api/roles' &&
        request.method === 'GET'
      ) {
        if (!can(user, permissions, 'manage_users')) {
          return json({
            error: 'You do not have permission to manage users.'
          }, 403, request);
        }

        const result = await env.DB
          .prepare(`
            SELECT role_id, permission
            FROM role_permissions
            ORDER BY role_id, permission
          `)
          .all();

        return json(
          result.results || [],
          200,
          request
        );
      }

      /*
       * SAVE ROLE PERMISSIONS
       */
      if (
        url.pathname === '/api/roles' &&
        request.method === 'PUT'
      ) {
        if (!can(user, permissions, 'manage_users')) {
          return json({
            error: 'You do not have permission to manage users.'
          }, 403, request);
        }

        const body = await request.json();

        if (!body.role_id) {
          return json({
            error: 'role_id is required.'
          }, 400, request);
        }

        const selectedPermissions = Array.isArray(
          body.permissions
        )
          ? body.permissions.filter(permission =>
              PERMISSIONS.includes(permission)
            )
          : [];

        await env.DB
          .prepare(`
            DELETE FROM role_permissions
            WHERE role_id = ?
          `)
          .bind(body.role_id)
          .run();

        for (const permission of selectedPermissions) {
          await env.DB
            .prepare(`
              INSERT OR IGNORE INTO role_permissions
                (role_id, permission)
              VALUES (?, ?)
            `)
            .bind(body.role_id, permission)
            .run();
        }

        return json({
          ok: true
        }, 200, request);
      }

      return json({
        error: 'API route not found'
      }, 404, request);
    }

    /*
     * SERVE THE WEBSITE
     */
    if (!env.ASSETS) {
      return new Response(
        'Assets binding is missing. Check wrangler.toml.',
        {
          status: 500,
          headers: {
            'Content-Type': 'text/plain'
          }
        }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
