export type Lang = "en" | "es" | "fr" | "de" | "pt" | "it" | "no";
export type UserRole = "visitor" | "whitelisted" | "admin";
export type AuthMethod = "otp";

export type ReviewSource = "survey" | "web";

export interface Review {
  id: string;
  source: ReviewSource;
  year?: number;
  rating?: number;
  priceUsd?: number;
  recommended?: boolean;
  comment?: string;
  originalComment?: string;
  translatedComment?: string;
  studentContact?: string;
  studentName?: string;
  semester?: string;
  createdAt: string;
}

export interface Listing {
  id: string;
  address: string;
  neighborhood: string;
  latitude?: number;
  longitude?: number;
  contacts: string[];
  priceUsd?: number;
  minPriceUsd?: number;
  maxPriceUsd?: number;
  capacity?: number;
  averageRating?: number;
  recommendationRate?: number;
  totalReviews: number;
  recentYear?: number;
  reviews: Review[];
}

export interface Dataset {
  generatedAt: string;
  sourceFile: string;
  totalListings: number;
  listings: Listing[];
}

export interface PendingWebReview {
  id: string;
  listingId: string;
  rating: number;
  priceUsd?: number;
  recommended: boolean;
  comment: string;
  originalComment?: string;
  translatedComment?: string;
  semester?: string;
  studentName?: string;
  studentContact?: string;
  studentEmail?: string;
  shareContactInfo?: boolean;
  createdAt: string;
}

export interface ApprovedWebReview extends PendingWebReview {
  approvedAt: string;
}
