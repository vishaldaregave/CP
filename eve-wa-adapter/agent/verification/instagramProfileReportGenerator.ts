import { InstagramProfileData } from "./apify/instagramProfile.ts";

export function generateInstagramIntelligenceReport(data: InstagramProfileData): string {
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
  const postsCount = data.postsCount > 1000 ? (data.postsCount / 1000).toFixed(1) + 'K' : data.postsCount;
  const followersCount = data.followersCount > 1000000 ? (data.followersCount / 1000000).toFixed(1) + 'M' : (data.followersCount > 1000 ? (data.followersCount / 1000).toFixed(1) + 'K' : data.followersCount);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Instagram Profile Intelligence Report</title>
  <style>
    :root {
      --bg: #0f121b;
      --card-bg: #161b22;
      --text: #e0e0e0;
      --highlight: #ff477e;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-family);
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: var(--card-bg);
      padding: 40px;
    }
    .header {
      text-align: center;
      padding: 20px 0 40px 0;
      border-bottom: 2px solid #333;
    }
    .header h1 {
      font-size: 36px;
      margin: 0;
      color: #fff;
    }
    .header h2 {
      font-size: 42px;
      margin: 0;
      color: var(--highlight);
    }
    .header h3 {
      font-size: 28px;
      color: #fca311;
      margin-top: 10px;
    }
    .stats-row {
      display: flex;
      justify-content: space-around;
      margin-top: 30px;
    }
    .stat-box {
      text-align: center;
    }
    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #fff;
    }
    .stat-label {
      font-size: 14px;
      color: #aaa;
    }
    .section-title {
      font-size: 24px;
      color: #fff;
      border-bottom: 2px solid var(--highlight);
      padding-bottom: 8px;
      margin-top: 40px;
      margin-bottom: 20px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .grid-item {
      background: #222;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #333;
    }
    th {
      background: #111;
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 12px; color: #ff477e; font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Apify · Intelligence Report</div>
      <h1>Instagram Profile</h1>
      <h2>Intelligence Report</h2>
      <h3>@${data.username}</h3>
      
      <div style="margin-top: 30px;">
        <img src="${data.profilePicUrl}" style="border-radius: 50%; width: 120px; height: 120px; border: 3px solid #ff477e;" alt="Profile Picture"/>
      </div>

      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value">${postsCount}</div>
          <div class="stat-label">Posts</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${followersCount}</div>
          <div class="stat-label">Followers</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${data.followsCount}</div>
          <div class="stat-label">Following</div>
        </div>
      </div>
      
      <div style="margin-top: 20px; font-size: 20px; font-weight: bold; color: #fff;">${data.fullName}</div>
      <div style="font-size: 14px; color: #888; margin-top: 5px;">${data.isVerified ? '✓ Verified' : ''}</div>
      
      <div style="margin-top: 20px; color: #ccc;">
        ${data.biography}
      </div>
    </div>

    <div class="section-title">Phase 3 · Content Feed Grid (3x3)</div>
    <div class="grid">
      ${data.latestPosts?.slice(0, 9).map((post, i) => `
        <div class="grid-item">
          POST ${i+1}
        </div>
      `).join('') || '<div style="grid-column: span 3; text-align: center; color: #888;">No posts found</div>'}
    </div>

    <div class="section-title">Phase 8 · Complete Apify Data Citation</div>
    <table>
      <tr><th>Field</th><th>Scraped Value</th></tr>
      <tr><td>Username</td><td>@${data.username}</td></tr>
      <tr><td>Full Name</td><td>${data.fullName}</td></tr>
      <tr><td>Followers</td><td>${data.followersCount}</td></tr>
      <tr><td>Posts</td><td>${data.postsCount}</td></tr>
    </table>
    
    <div style="margin-top: 40px; font-size: 12px; color: #555; text-align: center;">
      This report was generated automatically from Apify-scraped Instagram profile data.
    </div>
  </div>
</body>
</html>`;
}
