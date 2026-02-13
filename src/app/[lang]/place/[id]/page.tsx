import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewComment } from "@/app/[lang]/place/[id]/review-comment";
import { ReviewForm } from "@/app/[lang]/place/[id]/review-form";
import { AdminReviewEditForm } from "@/components/admin-review-edit-form";
import { ContactRichText } from "@/components/contact-rich-text";
import { ContactEditRequestForm } from "@/components/contact-edit-request-form";
import { ImageGalleryViewer } from "@/components/image-gallery-viewer";
import {
  canRequestContactEdits,
  canSubmitReviews,
  canUploadReviewImages,
  canViewContactInfo,
  canViewOwnerContactInfo,
  getCurrentUserRole,
} from "@/lib/auth";
import { getCachedPublicListingById, getListingById } from "@/lib/data";
import { splitReviewerContactParts } from "@/lib/reviewer-contact";
import { formatDecimal, formatPercent, formatUsd, formatUsdRangePlain } from "@/lib/format";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import { getReviewDisplayYear } from "@/lib/review-year";
import {
  getApprovedReviewsForListing,
  getCachedPublicApprovedReviewsForListing,
} from "@/lib/reviews-store";
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
  const isAdmin = role === "admin";
  const canViewOwnerInfo = canViewOwnerContactInfo(role);
  const canViewReviewerInfo = canViewContactInfo(role);
  const canWriteReviews = canSubmitReviews(role);
  const canRequestEdits = canRequestContactEdits(role);
  const canUploadImages = canUploadReviewImages(role);
  const isVisitorSafeView = !canViewOwnerInfo && !canViewReviewerInfo;
  const listing = isVisitorSafeView
    ? await getCachedPublicListingById(resolvedParams.id, lang)
    : await getListingById(resolvedParams.id, lang, {
        includeOwnerContactInfo: canViewOwnerInfo,
        includeReviewerContactInfo: canViewReviewerInfo,
      });
  if (!listing) {
    notFound();
  }

  const approvedWebReviews = isVisitorSafeView
    ? await getCachedPublicApprovedReviewsForListing(listing.id, lang)
    : await getApprovedReviewsForListing(listing.id, lang, {
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
      studentEmail: review.studentEmail,
      shareContactInfo: review.shareContactInfo,
      imageUrls: review.imageUrls,
      createdAt: review.createdAt,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const listingPriceRange = formatUsdRangePlain(
    {
      min: listing.minPriceUsd,
      max: listing.maxPriceUsd,
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
        {isAdmin ? (
          <Link href={`/${lang}/admin/publications?listingId=${listing.id}`} className="inline-link">
            {messages.adminEditListing}
          </Link>
        ) : null}
        {listing.imageUrls?.length ? (
          <ImageGalleryViewer
            lang={lang}
            images={listing.imageUrls}
            altBase={messages.imageAltProperty}
            ariaLabel={messages.imageAriaPropertyPhotos}
            variant="property"
          />
        ) : null}

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
              {listingPriceRange || "-"}
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
                <li key={contact}>
                  <ContactRichText contact={contact} />
                </li>
              ))}
            </ul>
          ) : (
            <p>-</p>
          )
        ) : (
          <p className="contact-lock-hint">{messages.ownerContactsLoginHint}</p>
        )}
        {canRequestEdits ? (
          <ContactEditRequestForm
            listingId={listing.id}
            currentContacts={listing.contacts}
            currentCapacity={listing.capacity}
            messages={messages}
          />
        ) : null}
      </article>

      <article className="detail-card detail-card--reviews">
        <h2>{messages.historicalReviews}</h2>

        {mergedReviews.filter((review) => review.comment).length === 0 ? (
          <p>{messages.noComments}</p>
        ) : (
          <ul className="review-list">
            {mergedReviews
              .filter((review) => review.comment)
              .map((review) => {
                const displayYear = getReviewDisplayYear(review);
                return (
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
                      {review.source === "web"
                        ? messages.reviewSourceWeb
                        : messages.reviewSourceSurvey}
                      {typeof displayYear === "number" ? ` · ${displayYear}` : ""}
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
                    {review.imageUrls?.length ? (
                      <ImageGalleryViewer
                        lang={lang}
                        images={review.imageUrls}
                        altBase={messages.imageAltReview}
                        ariaLabel={messages.imageAriaReviewPhotos}
                      />
                    ) : null}
                    {canViewReviewerInfo && review.studentContact ? (
                      <p className="review-item__contact">
                        {messages.reviewContactLabel}:{" "}
                        {splitReviewerContactParts(review.studentContact).map((part, index) => {
                          if (part.type === "link") {
                            const isExternal = part.kind === "whatsapp" || part.kind === "url";
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
                      </p>
                    ) : null}
                    {isAdmin ? (
                      <AdminReviewEditForm lang={lang} messages={messages} review={review} />
                    ) : null}
                  </li>
                );
              })}
          </ul>
        )}
      </article>

      {canWriteReviews ? (
        <article className="detail-card detail-card--form">
          <h2>{messages.leaveReviewTitle}</h2>
          <p>{messages.leaveReviewSubtitle}</p>
          <ReviewForm
            lang={lang}
            listingId={listing.id}
            messages={messages}
            canUploadImages={canUploadImages}
          />
        </article>
      ) : null}
    </section>
  );
}
