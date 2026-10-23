export const config = {
  matcher: [
    '/berita/:path*',
    '/program/:path*',
    '/khazanah/:path*',
    '/tokoh/:path*',
    '/agenda/:path*',
  ],
};

const SOCIAL_BOTS = /Twitterbot|facebookexternalhit|Facebot|LinkedInBot|Pinterest|Slackbot|vkShare|W3C_Validator|WhatsApp|TelegramBot|Discordbot/i;

export default async function middleware(request) {
  const userAgent = request.headers.get('user-agent') || '';
  
  // Jika bukan bot media sosial, lanjutkan ke SPA seperti biasa
  if (!SOCIAL_BOTS.test(userAgent)) {
    return;
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Format URL: /berita/slug-artikel
  if (pathParts.length < 2) return;

  const section = pathParts[0]; // berita, program, khazanah, tokoh, agenda
  const slug = pathParts[1];

  try {
    // Ambil data dari Worker API Anda
    const apiRes = await fetch('https://infopesantren-api.akabonanza-official.workers.dev/api/content');
    const apiJson = await apiRes.json();
    
    if (!apiJson.success || !apiJson.data || !apiJson.data.data) return;
    
    const allData = apiJson.data.data;
    const items = allData[section] || [];
    const article = items.find(x => x.slug === slug);

    if (!article) return;

    const title = article.title || article.name || 'InfoPesantren';
    const description = article.summary || article.description || article.bio || 'Portal Informasi Pesantren Indonesia';
    const image = article.image_url || 'https://infopesantren.online/favicon.ico'; // Fallback image
    const fullUrl = url.href;

    // Kembalikan HTML minimal yang kaya akan meta tag OG
    const html = `
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="UTF-8">
          <title>${title} - InfoPesantren.online</title>
          <meta name="description" content="${description}">
          
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${description}">
          <meta property="og:image" content="${image}">
          <meta property="og:url" content="${fullUrl}">
          <meta property="og:type" content="article">
          <meta property="og:site_name" content="InfoPesantren.online">
          
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${title}">
          <meta name="twitter:description" content="${description}">
          <meta name="twitter:image" content="${image}">
        </head>
        <body>
          <h1>${title}</h1>
          <p>${description}</p>
          <img src="${image}" alt="${title}" />
        </body>
      </html>
    `;

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

  } catch (error) {
    console.error('Middleware OG Error:', error);
    // Jika gagal, biarkan halaman normal dimuat (jangan blokir user)
    return;
  }
}
