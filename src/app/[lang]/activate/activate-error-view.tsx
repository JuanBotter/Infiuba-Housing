interface ActivateInviteErrorViewProps {
  title: string;
  error: string;
  contactHint: string;
}

function splitContactHint(text: string) {
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const matches = [...text.matchAll(emailPattern)];
  if (matches.length < 2) {
    return null;
  }

  const first = matches[0];
  const second = matches[1];
  const firstEmail = first[0];
  const secondEmail = second[0];
  const firstIndex = first.index ?? 0;
  const secondIndex = second.index ?? 0;
  const between = text
    .slice(firstIndex + firstEmail.length, secondIndex)
    .trim();

  return {
    message: text.slice(0, firstIndex).trim(),
    firstEmail,
    secondEmail,
    rest: `${between ? `${between} ` : ""}${text.slice(secondIndex + secondEmail.length).trim()}`.trim(),
  };
}

export function ActivateInviteErrorView({
  title,
  error,
  contactHint,
}: ActivateInviteErrorViewProps) {
  const splitHint = splitContactHint(contactHint);

  return (
    <section className="content-wrapper">
      <article className="detail-card detail-card--form">
        <h1 className="activate-invite-error-title">{title}</h1>
        <div className="activate-invite-error-view">
          <p className="form-status error">{error}</p>
          {splitHint ? (
            <>
              <p>{splitHint.message}</p>
              <p>
                <a href={`mailto:${splitHint.firstEmail}`}>{splitHint.firstEmail}</a>
              </p>
              <p>
                <a href={`mailto:${splitHint.secondEmail}`}>{splitHint.secondEmail}</a>
              </p>
              <p>{splitHint.rest}</p>
            </>
          ) : (
            <p>{contactHint}</p>
          )}
        </div>
      </article>
    </section>
  );
}
