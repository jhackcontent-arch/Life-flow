// Cloudflare Worker Backend for LifeFlow Sync
// Handles data synchronization between client and D1 database

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handling
      if (path === '/api/sync' && request.method === 'POST') {
        return await handleSync(request, env, corsHeaders);
      }
      
      if (path === '/api/data' && request.method === 'GET') {
        return await handleGetData(request, env, corsHeaders);
      }
      
      if (path === '/api/data' && request.method === 'POST') {
        return await handlePostData(request, env, corsHeaders);
      }
      
      if (path === '/api/data/:id' && request.method === 'PUT') {
        return await handleUpdateData(request, env, corsHeaders);
      }
      
      if (path === '/api/data/:id' && request.method === 'DELETE') {
        return await handleDeleteData(request, env, corsHeaders);
      }

      // Health check endpoint
      if (path === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Default response for unknown routes
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Handle sync endpoint - receives client changes and returns server changes
async function handleSync(request, env, corsHeaders) {
  const body = await request.json();
  const { clientId, lastSyncTimestamp, changes } = body;

  if (!clientId) {
    return new Response(JSON.stringify({ error: 'clientId is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const now = new Date().toISOString();
  
  // Process incoming changes from client
  if (changes && changes.length > 0) {
    for (const change of changes) {
      await applyChange(env.DB, change);
    }
  }

  // Get all changes since last sync timestamp
  let serverChanges = [];
  if (lastSyncTimestamp) {
    const stmt = env.DB.prepare(
      `SELECT * FROM sync_log 
       WHERE timestamp > ? 
       AND client_id != ? 
       ORDER BY timestamp ASC`
    );
    const result = await stmt.bind(lastSyncTimestamp, clientId).all();
    serverChanges = result.results || [];
  } else {
    // First sync - get all data
    const stmt = env.DB.prepare(`SELECT * FROM user_data WHERE client_id = ?`);
    const result = await stmt.bind(clientId).all();
    serverChanges = result.results || [];
  }

  // Log this sync operation
  await env.DB.prepare(
    `INSERT INTO sync_log (client_id, timestamp, sync_type) VALUES (?, ?, ?)`
  ).bind(clientId, now, 'full').run();

  return new Response(JSON.stringify({
    success: true,
    timestamp: now,
    changes: serverChanges,
    message: 'Sync completed successfully'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Apply a single change to the database
async function applyChange(db, change) {
  const { type, table, data, id } = change;

  switch (type) {
    case 'INSERT':
      if (table === 'user_data') {
        await db.prepare(
          `INSERT INTO user_data (id, client_id, content, timestamp, created_at) 
           VALUES (?, ?, ?, ?, ?)`
        ).bind(data.id, data.client_id, JSON.stringify(data.content), data.timestamp, data.created_at).run();
      }
      break;
    
    case 'UPDATE':
      if (table === 'user_data') {
        await db.prepare(
          `UPDATE user_data SET content = ?, timestamp = ? WHERE id = ?`
        ).bind(JSON.stringify(data.content), data.timestamp, id).run();
      }
      break;
    
    case 'DELETE':
      if (table === 'user_data') {
        await db.prepare(`DELETE FROM user_data WHERE id = ?`).bind(id).run();
      }
      break;
  }

  // Log the change
  await db.prepare(
    `INSERT INTO sync_log (client_id, timestamp, sync_type, record_id) 
     VALUES (?, ?, ?, ?)`
  ).bind(data.client_id, new Date().toISOString(), type, id).run();
}

// Handle GET /api/data - retrieve user data
async function handleGetData(request, env, corsHeaders) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId');

  if (!clientId) {
    return new Response(JSON.stringify({ error: 'clientId parameter is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const result = await env.DB.prepare(
    `SELECT * FROM user_data WHERE client_id = ? ORDER BY created_at DESC`
  ).bind(clientId).all();

  return new Response(JSON.stringify({
    success: true,
    data: result.results || []
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Handle POST /api/data - create new data entry
async function handlePostData(request, env, corsHeaders) {
  const body = await request.json();
  const { clientId, content } = body;

  if (!clientId || !content) {
    return new Response(JSON.stringify({ error: 'clientId and content are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO user_data (id, client_id, content, timestamp, created_at) 
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, clientId, JSON.stringify(content), now, now).run();

  return new Response(JSON.stringify({
    success: true,
    data: { id, client_id: clientId, content, timestamp: now, created_at: now }
  }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Placeholder handlers for UPDATE and DELETE
async function handleUpdateData(request, env, corsHeaders) {
  return new Response(JSON.stringify({ error: 'Not Implemented' }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleDeleteData(request, env, corsHeaders) {
  return new Response(JSON.stringify({ error: 'Not Implemented' }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
