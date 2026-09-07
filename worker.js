const OWNER_ID = '1334272703347294210';

const PERMS = [
  'view_books',
  'create_books',
  'edit_books',
  'delete_books',
  'manage_departments',
  'manage_users',
  'manage_settings'
];

const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      ...CORS_HEADERS
    }
  });
}

function redirect(url, cookies = []) {
  const headers = {
    Location: url
  };

  if (cookies.length > 0) {
    headers['Set-Cookie'] = cookies;
  }

  return new Response(null, {
    status: 302,
    headers
  });
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';

  for (const item of cookies.split(';')) {
    const [key, ...value] = item.trim().split('=');

    if (key === name) {
      return value.join('=');
    }
  }

  return null;
}

async function discordRequest(path, env, options = {}) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      ...(options.headers || {})
    }
  });
}

async function getSession(request, env) {
  const token = getCookie(request, 'pmb_session');

  if (!token) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  const session = await env.DB
    .prepare(
      `
      SELECT *
      FROM sessions
      WHERE token = ?
      AND expires_at > ?
      `
    )
    .bind(token, now)
    .first();

  return session || null;
}

async function getPermissions(request, env, user) {
  if (!user) {
    return [];
  }

  if (user.discord_id === OWNER_ID) {
    return [...PERMS];
  }

  const result = await env.DB
    .prepare(
      `
      SELECT DISTINCT rp.permission
      FROM role_permissions rp
      INNER JOIN user_roles ur
        ON ur.role_id = rp.role_id
      WHERE ur.discord_id = ?
      `
    )
    .bind(user.discord_id)
    .all();

  return [
    ...new Set(
      (result.results || []).map((row) => row.permission)
    )
  ];
}

function hasPermission(permissions, permission) {
  return permissions.includes(permission);
}

async function getDiscordGuilds(accessToken) {
  const response = await fetch(
    'https://discord.com/api/users/@me/guilds',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    return [];
  }

  return response.json();
}

async function getDiscordRoles(guildId, env) {
  const response = await discordRequest(
    `/guilds/${guildId}/roles`,
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
    const origin = url.origin;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Allow-Origin': origin
        }
      });
    }

    /*
     * Discord login
     */
    if (url.pathname === '/api/auth/login') {
      const loginURL =
        'https://discord.com/oauth2/authorize' +
        `?client_id=${encodeURIComponent(env.DISCORD_CLIENT_ID)}` +
        '&response_type=code' +
        `&redirect_uri=${encodeURIComponent(env.DISCORD_REDIRECT_URI)}` +
        '&scope=identify%20guilds';

      return redirect(loginURL);
    }

    /*
     * Discord callback
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

        if (!tokenData.access_token) {
          console.error(
            'Discord token error:',
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

        if (!discordUser.id) {
          return redirect('/?login=failed');
        }

        const now = Math.floor(Date.now() / 1000);
        const sessionToken = crypto.randomUUID();

        await env.DB
          .prepare(
            `
            INSERT INTO users
              (discord_id, username, avatar, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(discord_id)
            DO UPDATE SET
              username = excluded.username,
              avatar = excluded.avatar,
              updated_at = excluded.updated_at
            `
          )
          .bind(
            discordUser.id,
            discordUser.username || 'Unknown User',
            discordUser.avatar || '',
            now
          )
          .run();

        await env.DB
          .prepare(
            `
            INSERT INTO sessions
              (token, discord_id, expires_at)
            VALUES (?, ?, ?)
            `
          )
          .bind(
            sessionToken,
            discordUser.id,
            now + 604800
          )
          .run();

        /*
         * Store the user's Discord server roles.
         * This allows role permissions to be checked later.
         */
        const guilds = await getDiscordGuilds(
          tokenData.access_token
        );

        for (const guild of guilds) {
          const roles = await getDiscordRoles(
            guild.id,
            env
          );

          for (const role of roles) {
            const memberResponse = await discordRequest(
              `/guilds/${guild.id}/members/${discordUser.id}`,
              env
            );

            if (!memberResponse.ok) {
              continue;
            }

            const member = await memberResponse.json();

            if (
              Array.isArray(member.roles) &&
              member.roles.includes(role.id)
            ) {
              await env.DB
                .prepare(
                  `
                  INSERT OR IGNORE INTO user_roles
                    (discord_id, role_id)
                  VALUES (?, ?)
                  `
                )
                .bind(discordUser.id, role.id)
                .run();
            }
          }
        }

        return redirect('/', [
          `pmb_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
        ]);
      } catch (error) {
        console.error('Discord callback error:', error);
        return redirect('/?login=failed');
      }
    }

    /*
     * Logout
     */
    if (url.pathname === '/api/auth/logout') {
      const token = getCookie(request, 'pmb_session');

      if (token) {
        await env.DB
          .prepare('DELETE FROM sessions WHERE token = ?')
          .bind(token)
          .run();
      }

      return redirect('/', [
        'pmb_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
      ]);
    }

    /*
     * API routes
     */
    if (url.pathname.startsWith('/api/')) {
      const user = await getSession(request, env);

      /*
       * Current logged-in user
       */
      if (url.pathname === '/api/me') {
        return json(
          {
            loggedIn: Boolean(user),
            user: user
              ? {
                  discord_id: user.discord_id,
                  username: user.username,
                  avatar: user.avatar
                }
              : null,
            permissions: await getPermissions(
              request,
              env,
              user
            )
          },
          200,
          origin
        );
      }

      if (!user) {
        return json(
          {
            error: 'Login required'
          },
          401,
          origin
        );
      }

      const permissions = await getPermissions(
        request,
        env,
        user
      );

      /*
       * Shared books and departments data
       */
      if (url.pathname === '/api/data') {
        if (request.method === 'GET') {
          if (
            !hasPermission(
              permissions,
              'view_books'
            )
          ) {
            return json(
              {
                error: 'You do not have permission to view books.'
              },
              403,
              origin
            );
          }

          const row = await env.DB
            .prepare(
              'SELECT data FROM portal_data WHERE id = 1'
            )
            .first();

          return json(
            row
              ? JSON.parse(row.data)
              : {
                  departments: [],
                  books: []
                },
            200,
            origin
          );
        }

        if (request.method === 'PUT') {
          if (
            !hasPermission(
              permissions,
              'edit_books'
            )
          ) {
            return json(
              {
                error: 'You do not have permission to edit books.'
              },
              403,
              origin
            );
          }

          const newData = await request.json();

          await env.DB
            .prepare(
              `
              INSERT INTO portal_data
                (id, data, updated_at)
              VALUES (1, ?, ?)
              ON CONFLICT(id)
              DO UPDATE SET
                data = excluded.data,
                updated_at = excluded.updated_at
              `
            )
            .bind(
              JSON.stringify(newData),
              Math.floor(Date.now() / 1000)
            )
            .run();

          return json(
            {
              ok: true
            },
            200,
            origin
          );
        }
      }

      /*
       * Discord roles
       */
      if (
        url.pathname === '/api/roles' &&
        request.method === 'GET'
      ) {
        if (
          !hasPermission(
            permissions,
            'manage_users'
          )
        ) {
          return json(
            {
              error: 'You do not have permission to manage roles.'
            },
            403,
            origin
          );
        }

        const rows = await env.DB
          .prepare(
            `
            SELECT *
            FROM role_permissions
            ORDER BY role_id
            `
          )
          .all();

        return json(
          rows.results || [],
          200,
          origin
        );
      }

      /*
       * Save permissions for a Discord role
       */
      if (
        url.pathname === '/api/roles' &&
        request.method === 'PUT'
      ) {
        if (
          !hasPermission(
            permissions,
            'manage_users'
          )
        ) {
          return json(
            {
              error: 'You do not have permission to manage roles.'
            },
            403,
            origin
          );
        }

        const body = await request.json();

        if (!body.role_id) {
          return json(
            {
              error: 'A role ID is required.'
            },
            400,
            origin
          );
        }

        await env.DB
          .prepare(
            `
            DELETE FROM role_permissions
            WHERE role_id = ?
            `
          )
          .bind(body.role_id)
          .run();

        for (const permission of body.permissions || []) {
          if (!PERMS.includes(permission)) {
            continue;
          }

          await env.DB
            .prepare(
              `
              INSERT INTO role_permissions
                (role_id, permission)
              VALUES (?, ?)
              `
            )
            .bind(body.role_id, permission)
            .run();
        }

        return json(
          {
            ok: true
          },
          200,
          origin
        );
      }

      return json(
        {
          error: 'API route not found'
        },
        404,
        origin
      );
    }

    /*
     * Serve the website.
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
