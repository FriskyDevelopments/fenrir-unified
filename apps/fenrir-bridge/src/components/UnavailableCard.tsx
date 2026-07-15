type UnavailableCardProps = {
  loaded: boolean;
  unavailableLabel: string;
  unavailableTitle: string;
  unavailableBody: string;
  loadingLabel: string;
  loadingTitle: string;
  loadingBody: string;
};

export function UnavailableCard({
  loaded,
  unavailableLabel,
  unavailableTitle,
  unavailableBody,
  loadingLabel,
  loadingTitle,
  loadingBody,
}: UnavailableCardProps) {
  return (
    <section className="join-card unavailable">
      <span className="mark">F</span>
      <p className="label">{loaded ? unavailableLabel : loadingLabel}</p>
      <h1>{loaded ? unavailableTitle : loadingTitle}</h1>
      <p>{loaded ? unavailableBody : loadingBody}</p>
    </section>
  );
}
