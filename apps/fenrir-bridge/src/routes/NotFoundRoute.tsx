import { useEffect } from "react";

export function NotFoundRoute() {
  const requestedPath = window.location.pathname;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "404 — Route Denied | MyFenrir";
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const createdRobots = !robots;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    const previousRobots = robots.content;
    robots.content = "noindex, follow";
    return () => {
      document.title = previousTitle;
      if (createdRobots) robots?.remove();
      else if (robots) robots.content = previousRobots;
    };
  }, []);

  return (
    <main className="fenrir-not-found">
      <div className="fenrir-not-found__aurora" aria-hidden="true" />
      <section className="fenrir-not-found__gate">
        <a className="fenrir-not-found__brand" href="/" aria-label="MyFenrir home">
          <img src="/fenrir-cut-wordmark.svg" alt="MyFenrir" />
        </a>

        <div className="fenrir-not-found__mascot" aria-hidden="true">
          <img src="/fenrir-splash-icon.svg" alt="" />
        </div>

        <div className="fenrir-not-found__copy">
          <p className="fenrir-not-found__code">Error 404 · Gate unavailable</p>
          <h1>Verification failed.</h1>
          <p>
            Fenrir could not verify this route because the requested gate does
            not exist. Your identity remains secure.
          </p>
        </div>

        <nav className="fenrir-not-found__actions" aria-label="Continue through MyFenrir">
          <a href="/">Try again</a>
          <a href="/main">Open command center</a>
        </nav>

        <div className="fenrir-not-found__trust">
          <span><i /> Guardian online</span>
          <span>No tracking · No image puzzles</span>
        </div>

        <code className="fenrir-not-found__path">{requestedPath}</code>
      </section>
    </main>
  );
}
