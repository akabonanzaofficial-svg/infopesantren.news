// api/generate-sitemap.js
export default async function handler(req, res) {
  // 1. Verifikasi Keamanan menggunakan header kustom (menghindari bug Vercel)
  const authHeader = req.headers['x-cron-secret'];
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. Ambil data.json dari Worker API Anda
    const apiRes = await fetch('https://infopesantren-api.akabonanza-official.workers.dev/api/content');
    const apiJson = await apiRes.json();
    
    if (!apiJson.success || !apiJson.data || !apiJson.data.data) {
      throw new Error('Gagal mengambil data dari API Worker');
    }
    
    const data = apiJson.data.data;
    const domain = 'https://infopesantren.online';

    // 3. Susun XML Sitemap
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Halaman Statis
    const staticPages = ['/', '/berita', '/program', '/khazanah', '/tokoh', '/agenda'];
    staticPages.forEach(p => {
      xml += `  <url>\n    <loc>${domain}${p}</loc>\n    <changefreq>daily</changefreq>\n  </url>\n`;
    });

    // Fungsi untuk menambahkan URL artikel
    const addUrls = (items, category) => {
      (items || []).forEach(item => {
        if (item.slug) {
          xml += `  <url>\n    <loc>${domain}/${category}/${item.slug}</loc>\n    <priority>0.6</priority>\n  </url>\n`;
        }
      });
    };

    // Tambahkan semua kategori
    addUrls(data.berita, 'berita');
    addUrls(data.program, 'program');
    addUrls(data.khazanah, 'khazanah');
    addUrls(data.tokoh, 'tokoh');
    addUrls(data.agenda, 'agenda');

    xml += '</urlset>';

    // 4. Simpan ke GitHub
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
    const GITHUB_OWNER = process.env.GITHUB_OWNER; 
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

    // Dapatkan SHA file sitemap.xml yang lama (jika ada) untuk update
    const getShaRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/sitemap.xml?ref=${GITHUB_BRANCH}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    
    let sha = null;
    if (getShaRes.ok) {
      const shaJson = await getShaRes.json();
      sha = shaJson.sha;
    }

    // Commit file baru
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/sitemap.xml`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Cron'
      },
      body: JSON.stringify({
        message: 'Auto-update sitemap.xml via Vercel Cron',
        content: Buffer.from(xml).toString('base64'),
        sha: sha, // Sertakan sha jika file sudah ada
        branch: GITHUB_BRANCH
      })
    });

    if (!commitRes.ok) {
      const err = await commitRes.text();
      throw new Error(`Gagal commit ke GitHub: ${err}`);
    }

    res.status(200).json({ success: true, message: 'Sitemap berhasil diupdate' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
