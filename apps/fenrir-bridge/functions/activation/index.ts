export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  
  // Check if a bot parameter is specified to allow direct redirect
  const botParam = url.searchParams.get("bot");
  if (botParam === "security") {
    return Response.redirect(new URL("/activation/security" + url.search, url.origin).toString(), 302);
  } else if (botParam === "core") {
    return Response.redirect(new URL("/activation/core" + url.search, url.origin).toString(), 302);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CYBERPUP // ACTIVATION GATEWAY</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;750;850;950&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            color-scheme: dark;
            --theme-primary: #ff334e;
            --theme-secondary: #22c7a8;
            --theme-accent: #f1b75c;
            --theme-glow: rgba(255, 23, 68, .18);
            --text: #eef6f3;
            --surface: #111819;
            --mono: "JetBrains Mono", Consolas, "Liberation Mono", monospace;
        }

        body {
            margin: 0;
            min-height: 100vh;
            background:
                radial-gradient(circle at 80% 20%, rgba(255,23,68,.12), transparent 40%),
                radial-gradient(circle at 20% 80%, rgba(34,199,168,.10), transparent 40%),
                linear-gradient(180deg, #090b0c 0%, #040607 100%);
            color: var(--text);
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
            overflow-x: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .gateway-card {
            position: relative;
            overflow: hidden;
            width: min(480px, 100% - 32px);
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 16px;
            padding: 36px 28px;
            background:
                radial-gradient(circle at 50% 0%, rgba(255,255,255,.08), transparent 45%),
                linear-gradient(145deg, rgba(255,255,255,.07), rgba(255,255,255,.02) 40%, rgba(34,199,168,.03) 100%),
                rgba(13,18,21,.75);
            box-shadow:
                0 0 0 1px rgba(255,255,255,.05) inset,
                0 24px 60px rgba(0,0,0,.45),
                0 0 40px var(--theme-glow);
            backdrop-filter: blur(24px) saturate(1.2);
            -webkit-backdrop-filter: blur(24px) saturate(1.2);
        }

        .gateway-card::before {
            content: "";
            position: absolute;
            inset: -1px;
            pointer-events: none;
            border-radius: inherit;
            background: linear-gradient(110deg, transparent 20%, rgba(255,23,68,.3) 40%, rgba(34,199,168,.3) 60%, transparent 80%);
            opacity: .6;
            mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            mask-composite: exclude;
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            padding: 1px;
            animation: liquidSweep 5s ease-in-out infinite;
        }

        @keyframes liquidSweep {
            0% { transform: translateX(-60%) skewX(-10deg); }
            50%, 100% { transform: translateX(120%) skewX(-10deg); }
        }

        .btn-option {
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .btn-option:hover {
            background: rgba(255, 255, 255, 0.08);
            transform: translateY(-2px);
        }

        .btn-option-security:hover {
            border-color: rgba(255, 51, 78, 0.5);
            box-shadow: 0 8px 24px rgba(255, 51, 78, 0.15);
        }

        .btn-option-core:hover {
            border-color: rgba(34, 199, 168, 0.5);
            box-shadow: 0 8px 24px rgba(34, 199, 168, 0.15);
        }

        .kicker {
            font-size: 11px;
            font-weight: 850;
            letter-spacing: .2em;
            text-transform: uppercase;
            color: var(--theme-secondary);
        }

        .title {
            background: linear-gradient(90deg, #fff 30%, var(--theme-primary) 70%, var(--theme-accent) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            font-size: 28px;
            font-weight: 950;
            line-height: 1.1;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <div class="gateway-card">
        <div class="text-center mb-8">
            <span class="kicker">Identity Node Gateway</span>
            <h1 class="title mt-2">Cyberpup Activation</h1>
            <p class="text-gray-400 text-xs font-light mt-3 leading-relaxed">
                Select the target bot identity deployment to proceed with Supabase activation and group authorization.
            </p>
        </div>

        <div class="flex flex-col gap-4">
            <a href="/activation/security${url.search}" class="btn-option btn-option-security p-5 rounded-xl block text-left">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-white text-sm font-semibold tracking-wide uppercase">Cyberpup Security</h2>
                        <p class="text-gray-400 text-[11px] font-light mt-1">Branded links, locks, invite rotation, and audit logs.</p>
                    </div>
                    <span class="text-[#ff334e] text-xs font-mono font-bold ml-4">SELECT &rarr;</span>
                </div>
            </a>

            <a href="/activation/core${url.search}" class="btn-option btn-option-core p-5 rounded-xl block text-left">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-white text-sm font-semibold tracking-wide uppercase">Cyberpup Core</h2>
                        <p class="text-gray-400 text-[11px] font-light mt-1">Group management, command deck, and moderation.</p>
                    </div>
                    <span class="text-[#22c7a8] text-xs font-mono font-bold ml-4">SELECT &rarr;</span>
                </div>
            </a>
        </div>

        <div class="mt-8 pt-6 border-t border-white/5 text-center">
            <p class="text-gray-500 text-[10px] font-mono uppercase tracking-widest">
                Node status // online // authorization ready
            </p>
        </div>
    </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://telegram.org https://oauth.telegram.org https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://esm.run https://*.esm.run; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; object-src 'none'; connect-src 'self' https://yqevglppbhuoxxfsfnih.supabase.co https://cloudflareinsights.com https://*.supabase.co https://api.workos.com https://auth.workos.com; frame-src https://oauth.telegram.org; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.workos.com; upgrade-insecure-requests"
    }
  });
}
