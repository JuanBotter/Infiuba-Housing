import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewComment } from "@/app/[lang]/place/[id]/review-comment";
import { ReviewForm } from "@/app/[lang]/place/[id]/review-form";
import {
  canSubmitReviews,
  canViewContactInfo,
  canViewOwnerContactInfo,
  getCurrentUserRole,
} from "@/lib/auth";
import { getListingById } from "@/lib/data";
import { buildSafeMailtoHref, isStrictEmail } from "@/lib/email";
import { formatDecimal, formatPercent, formatUsd, formatUsdRange } from "@/lib/format";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import { getApprovedReviewsForListing } from "@/lib/reviews-store";
import type { Lang, Review } from "@/types";

export const dynamic = "force-dynamic";

interface PlaceDetailPageProps {
  params: Promise<{ lang: string; id: string }>;
}

export default async function PlaceDetailPage({ params }: PlaceDetailPageProps) {
  const resolvedParams = await params;

  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const role = await getCurrentUserRole();
  const canViewOwnerInfo = canViewOwnerContactInfo(role);
  const canViewReviewerInfo = canViewContactInfo(role);
  const canWriteReviews = canSubmitReviews(role);
  const listing = await getListingById(resolvedParams.id, lang, {
    includeOwnerContactInfo: canViewOwnerInfo,
    includeReviewerContactInfo: canViewReviewerInfo,
  });
  if (!listing) {
    notFound();
  }

  const approvedWebReviews = await getApprovedReviewsForListing(listing.id, lang, {
    includePrivateContactInfo: canViewReviewerInfo,
  });
  const mergedReviews: Review[] = [
    ...listing.reviews,
    ...approvedWebReviews.map((review) => ({
      id: review.id,
      source: "web" as const,
      year: undefined,
      rating: review.rating,
      priceUsd: review.priceUsd,
      recommended: review.recommended,
      comment: review.comment,
      originalComment: review.originalComment,
      translatedComment: review.translatedComment,
      semester: review.semester,
      studentName: review.studentName,
      studentContact: review.studentContact,
      createdAt: review.createdAt,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const listingPriceRange = formatUsdRange(
    {
      min: listing.minPriceUsd,
      max: listing.maxPriceUsd,
      fallback: listing.priceUsd,
    },
    lang,
  );

  return (
    <section className="content-wrapper">
      <Link href={`/${lang}`} className="inline-link">
        ← {messages.backToListings}
      </Link>

      <article className="detail-card detail-card--primary">
        <p className="detail-card__eyebrow">{listing.neighborhood}</p>
        <h1>{listing.address}</h1>

        <div className="detail-card__stats">
          <p>
            <span>{messages.ratingLabel}</span>
            <strong>
              {typeof listing.averageRating === "number"
                ? formatDecimal(listing.averageRating, lang)
                : "-"}
            </strong>
          </p>
          <p>
            <span>{messages.recommendationRateLabel}</span>
            <strong>
              {typeof listing.recommendationRate === "number"
                ? formatPercent(listing.recommendationRate, lang)
                : "-"}
            </strong>
          </p>
          <p>
            <span>{messages.priceLabel}</span>
            <strong>
              {listingPriceRange ? `${listingPriceRange} ${messages.monthSuffix}` : "-"}
            </strong>
          </p>
          <p>
            <span>{messages.capacityLabel}</span>
            <strong>
              {typeof listing.capacity === "number"
                ? `${Math.round(listing.capacity)} ${messages.studentsSuffix}`
                : "-"}
            </strong>
          </p>
        </div>

        <h2>{messages.ownerContacts}</h2>
        {canViewOwnerInfo ? (
          listing.contacts.length > 0 ? (
            <ul className="contact-list">
              {listing.contacts.map((contact) => (
                <li key={contact}>{contact}</li>
              ))}
            </ul>
          ) : (
            <p>-</p>
          )
        ) : (
          <p className="contact-lock-hint">{messages.ownerContactsLoginHint}</p>
        )}
      </article>

      <article className="detail-card detail-card--reviews">
        <h2>{messages.historicalReviews}</h2>

        {mergedReviews.filter((review) => review.comment).length === 0 ? (
          <p>{messages.noComments}</p>
        ) : (
          <ul className="review-list">
            {mergedReviews
              .filter((review) => review.comment)
              .map((review) => (
                <li
                  key={review.id}
                  className={`review-item ${
                    review.recommended === true
                      ? "review-item--yes"
                      : review.recommended === false
                        ? "review-item--no"
                        : ""
                  }`}
                >
                  <p className="review-item__meta">
                    {review.source === "web" ? "Web" : "Survey"}
                    {review.year ? ` · ${review.year}` : ""}
                    {review.semester ? ` · ${review.semester}` : ""}
                    {typeof review.rating === "number" ? ` · ${review.rating}/5` : ""}
                    {typeof review.priceUsd === "number"
                      ? ` · ${formatUsd(review.priceUsd, lang)} ${messages.monthSuffix}`
                      : ""}
                    {typeof review.recommended === "boolean"
                      ? ` · ${review.recommended ? messages.yes : messages.no}`
                      : ""}
                  </p>
                  <ReviewComment
                    comment={review.comment || ""}
                    translatedComment={review.translatedComment}
                    originalComment={review.originalComment}
                    showOriginalLabel={messages.reviewShowOriginal}
                    showTranslationLabel={messages.reviewShowTranslation}
                  />
                  {canViewReviewerInfo && review.studentContact ? (
                    <p className="review-item__contact">
                      {messages.reviewContactLabel}:{" "}
                      {isStrictEmail(review.studentContact) ? (
                        <a href={buildSafeMailtoHref(review.studentContact)}>
                          {review.studentContact}
                        </a>
                      ) : (
                        review.studentContact
                      )}
                    </p>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </article>

      {canWriteReviews ? (
        <article className="detail-card detail-card--form">
          <h2>{messages.leaveReviewTitle}</h2>
          <p>{messages.leaveReviewSubtitle}</p>
          <ReviewForm lang={lang} listingId={listing.id} />
        </article>
      ) : null}
    </section>
  );
}
