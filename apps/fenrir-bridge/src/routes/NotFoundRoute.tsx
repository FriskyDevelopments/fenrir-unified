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
      <div className="fenrir-not-found__grain" aria-hidden="true" />
      <div className="fenrir-not-found__scan" aria-hidden="true" />

      <header className="fenrir-not-found__header">
        <a href="/" aria-label="MyFenrir home">
          <img src="/fenrir-cut-wordmark.svg" alt="Fenrir" />
        </a>
        <span><i /> Guardian online</span>
        <span>Protocol / 404</span>
      </header>

      <section className="fenrir-not-found__stage">
        <div className="fenrir-not-found__guardian" aria-hidden="true">
          <span className="fenrir-not-found__ring fenrir-not-found__ring--outer" />
          <span className="fenrir-not-found__ring fenrir-not-found__ring--inner" />
          <img src="/fenrir-cyber-guardian-hero.svg" alt="" />
        </div>

        <p className="fenrir-not-found__number" aria-hidden="true">404</p>

        <div className="fenrir-not-found__copy">
          <p className="fenrir-not-found__kicker">Perimeter reached / Destination absent</p>
          <h1>Route<br /><em>denied.</em></h1>
          <p className="fenrir-not-found__body">
            Fenrir found no protected destination at this address. Your identity
            remains secure; only the route is missing.
          </p>
          <nav className="fenrir-not-found__actions" aria-label="Continue through MyFenrir">
            <a href="/">Return to MyFenrir <span aria-hidden="true">&#8599;</span></a>
            <a href="/main">Open command center</a>
          </nav>
        </div>
      </section>

      <footer className="fenrir-not-found__footer">
        <span>Requested path</span>
        <code>{requestedPath}</code>
        <span>Identity intact / Access closed</span>
      </footer>
    </main>
  );
}
