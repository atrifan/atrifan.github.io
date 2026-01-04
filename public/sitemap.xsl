<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>Tulzo Sitemap</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style type="text/css">
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
            color: #fff;
            margin: 0;
            padding: 1rem;
            min-height: 100vh;
          }
          h1 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            overflow: hidden;
          }
          th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.1);
          }
          th {
            background: rgba(102, 126, 234, 0.2);
            font-weight: 600;
          }
          a {
            color: #a78bfa;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .count {
            color: rgba(255,255,255,0.6);
            font-size: 0.9rem;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <h1>🗺️ Tulzo Sitemap</h1>
        <p class="count">
          <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> URLs
        </p>
        <table>
          <tr>
            <th>URL</th>
            <th>Priority</th>
          </tr>
          <xsl:for-each select="sitemap:urlset/sitemap:url">
            <tr>
              <td>
                <a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a>
              </td>
              <td><xsl:value-of select="sitemap:priority"/></td>
            </tr>
          </xsl:for-each>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>

