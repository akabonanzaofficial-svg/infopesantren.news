// api/generate-sitemap.js
export default async function handler(req, res) {
  // 1. Verifikasi Keamanan
  const authHeader = req.headers['x-cron-secret'] || req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. Ambil Data
    const apiRes = await fetch('https://infopesantren-api.akabonanza-official.workers.dev/api/content');
    const apiJson = await apiRes.json();
    if (!apiJson.success || !apiJson.data || !apiJson.data.data) throw new Error('Gagal mengambil data dari API Worker');
    
    const data = apiJson.data.data;
    const domain = 'https://infopesantren.online';
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000));

    // 3. Susun Sitemap Biasa (sitemap.xml)
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    const staticPages = ['/', '/berita', '/program', '/khazanah', '/tokoh', '/pesantren', '/agenda'];
    staticPages.forEach(p => { xml += `  <url>\n    <loc>${domain}${p}</loc>\n    <changefreq>daily</changefreq>\n  </url>\n`; });

    const addUrls = (items, category) => {
      (items || []).forEach(item => {
        if (item.slug) xml += `  <url>\n    <loc>${domain}/${category}/${item.slug}</loc>\n    <priority>0.6</priority>\n  </url>\n`;
      });
    };
    addUrls(data.berita, 'berita'); addUrls(data.program, 'program'); addUrls(data.khazanah, 'khazanah');
    addUrls(data.tokoh, 'tokoh'); addUrls(data.pesantren, 'pesantren'); addUrls(data.agenda, 'agenda');
    xml += '</urlset>';

    // 4. Susun Google News Sitemap (sitemap-news.xml) - Hanya 48 Jam Terakhir
    let newsXml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';
    
    const recentNews = (data.berita || []).filter(item => {
      const pubDate = new Date(item.published_at || item.date_start);
      return pubDate >= twoDaysAgo && item.status === 'published';
    });

    recentNews.forEach(item => {
      if (item.slug) {
        newsXml += `  <url>\n    <loc>${domain}/berita/${item.slug}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>InfoPesantren.online</news:name>\n        <news:language>id</news:language>\n      </news:publication>\n      <news:publication_date>${item.published_at || item.date_start}</news:publication_date>\n      <news:title>${item.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</news:title>\n    </news:news>\n  </url>\n`;
      }
    });
    newsXml += '</urlset>';

    // 5. Simpan ke GitHub
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
    const GITHUB_OWNER = process.env.GITHUB_OWNER; 
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

    const uploadFile = async (filename, content, message) => {
      const getShaRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}?ref=${GITHUB_BRANCH}`, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } });
      let sha = null;
      if (getShaRes.ok) sha = (await getShaRes.json()).sha;

      const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Vercel-Cron' },
        body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha, branch: GITHUB_BRANCH })
      });
      if (!commitRes.ok) throw new Error(`Gagal commit ${filename}`);
    };

    await uploadFile('sitemap.xml', xml, 'Auto-update sitemap.xml');
    await uploadFile('sitemap-news.xml', newsXml, 'Auto-update sitemap-news.xml');

    res.status(200).json({ success: true, message: 'Sitemap berhasil diupdate' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
