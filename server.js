const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Forces Node to look up IPv4 addresses before IPv6

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
// ... rest of your code stays exactly the same
// const express = require('express');

const app = express();
// Render automatically provides a PORT environment variable, so we use process.env.PORT || 3000
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.text({ type: '*/*' }));

// 1. Connect to your Cloud PostgreSQL database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required by cloud providers like Neon/Supabase
});

// 2. Create the table in PostgreSQL on startup
pool.query(`
    CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        project_id TEXT,
        url TEXT,
        message TEXT,
        source TEXT,
        lineno INTEGER,
        timestamp BIGINT
    )
`, (err, res) => {
    if (err) console.error('❌ Error creating PostgreSQL table:', err);
    else console.log('📁 PostgreSQL table ready.');
});

// 3. Ingestion Endpoint (Fixed to use PostgreSQL)
app.post('/ingest', async (req, res) => {
    try {
        const data = JSON.parse(req.body);
        const { projectId, url, events } = data;

        // Loop through all events and insert them into PostgreSQL
        for (const event of events) {
            if (event.type === 'error') {
                const queryText = `
                    INSERT INTO error_logs (project_id, url, message, source, lineno, timestamp)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `;
                const values = [projectId, url, event.message, event.source, event.lineno, event.timestamp];
                
                await pool.query(queryText, values);
            }
        }

        console.log(` Saved ${events.length} events to PostgreSQL cloud DB.`);
        res.status(200).send({ status: 'success' });
    } catch (error) {
        console.error('Processing error:', error);
        res.status(400).send({ status: 'bad_request' });
    }
});

// 4. Metrics Endpoint (Fixed to FETCH data from PostgreSQL)
app.get('/api/metrics', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM error_logs ORDER BY timestamp DESC');
        // Return rows matching the exact format your frontend dashboard expects
        res.json({ data: result.rows });
    } catch (err) {
        console.error('Error fetching metrics:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 OmniSight Server running on port ${PORT}`);
});