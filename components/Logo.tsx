// STS brand lockup: charcoal "STS" wordmark, tri-color underbar, tagline.
// Pure CSS/markup so it stays crisp and adapts to light/dark automatically.
// To use the exact PNG instead, drop it at /public/sts-logo.png and swap the
// wordmark/bar/tagline below for <img src="/sts-logo.png" alt="STS — Smart Transportation Solutions" />.
export default function Logo({
  showTagline = true,
  className = "",
}: {
  showTagline?: boolean;
  className?: string;
}) {
  // segment weights mirror the underbar in the STS logo
  const bar: [string, number][] = [
    ["#db4536", 20],
    ["#ef7d1a", 10],
    ["#f2a50a", 34],
    ["#5cb036", 8],
    ["#099c57", 28],
  ];
  return (
    <span
      className={`sts-logo ${className}`}
      role="img"
      aria-label="STS — Smart Transportation Solutions"
    >
      <span className="sts-wordmark" aria-hidden>
        STS
      </span>
      <span className="sts-bar" aria-hidden>
        {bar.map(([color, grow], i) => (
          <i key={i} style={{ background: color, flexGrow: grow }} />
        ))}
      </span>
      {showTagline && (
        <span className="sts-tagline" aria-hidden>
          Smart Transportation Solutions
        </span>
      )}
    </span>
  );
}
