const express = require('express')
var cors = require('cors')
const SphericalMercator = require('@mapbox/sphericalmercator')
const { Pool } = require('pg')
const conn = new Pool({
  host: 'postgis',
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})
const mercator = new SphericalMercator({ size: 256 })
const app = express()

app.use(cors())

app.get('/envolvente/tiles/:z/:x/:y.mvt', async (req, res) => {
  const { z, x, y } = req.params;

  // calculate the bounding polygon for this tile 
  const bbox = mercator.bbox(x, y, z, false);

  // Query the database, using ST_AsMVTGeom() to clip the geometries
  // Wrap the whole query with ST_AsMVT(), which will create a protocol buffer
  const sql = `
    SELECT ST_AsMVT(tile, 'envolvente', 4096, 'mvt_geom') AS mvt
    FROM (
        SELECT
          idpob,fecha,version,tipo,cpro,nombre,ine,codine,fechaine,tipogeom,
          ST_AsMVTGeom(
              -- Geometry from table
              ST_Transform(t.geom, 3857),
              -- MVT tile boundary
              ST_Makebox2d(
                  -- Lower left coordinate
                  ST_Transform(ST_SetSrid(ST_MakePoint($1, $2), 4326), 3857),
                  -- Upper right coordinate
                  ST_Transform(ST_SetSrid(ST_MakePoint($3, $4), 4326), 3857)
              ),
              -- Extent
              4096,
              -- Buffer
              256,
              -- Clip geom
              true
          ) AS mvt_geom
        FROM envolvente t
        WHERE
            t.geom
            && ST_Makebox2d(
                ST_Transform(ST_SetSrid(ST_MakePoint($1, $2), 4326), 4326),
                ST_Transform(ST_SetSrid(ST_MakePoint($3, $4), 4326), 4326)
            )
    ) AS tile
  `;

  try {
    const tile = await conn.query(sql, bbox)

    // set the response header content type
    res.setHeader('Content-Type', 'application/x-protobuf')

    // if the vector tile has no data then return a 204
    if (!tile.rows.length) {
      res.status(204)
    } else {
      // send the tile
      res.send(tile.rows[0].mvt)
    }
  } catch (err) {
    res.status(404).send({
      error: err.toString()
    })
  }
})

app.listen(process.env.MVT_SERVER_PORT, () => console.log(`listening on port ${process.env.MVT_SERVER_PORT}...`))