import { splitContactParts } from "@/lib/contact-links";

interface ContactRichTextProps {
  contact: string;
}

export function ContactRichText({ contact }: ContactRichTextProps) {
  return (
    <>
      {splitContactParts(contact).map((part, index) => {
        if (part.type === "link") {
          const isExternal = part.kind === "url";
          return (
            <a
              key={`${part.text}-${index}`}
              href={part.href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer" : undefined}
            >
              {part.text}
            </a>
          );
        }
        return <span key={`${part.text}-${index}`}>{part.text}</span>;
      })}
    </>
  );
}
