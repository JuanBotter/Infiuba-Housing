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
  studentEmail?: string;
  shareContactInfo?: boolean;
  semester?: string;
  imageUrls?: string[];
  createdAt: string;
}

export interface Listing {
  id: string;
  address: string;
  neighborhood: string;
  latitude?: number;
  longitude?: number;
  contacts: string[];
  minPriceUsd?: number;
  maxPriceUsd?: number;
  reviewPrices?: number[];
  capacity?: number;
  averageRating?: number;
  recommendationRate?: number;
  totalReviews: number;
  recentYear?: number;
  imageUrls?: string[];
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
  imageUrls?: string[];
  createdAt: string;
}

export interface ApprovedWebReview extends PendingWebReview {
  approvedAt: string;
}

export interface AdminEditableReview extends PendingWebReview {
  source: ReviewSource;
  status: "pending" | "approved" | "rejected";
  year?: number;
  approvedAt?: string;
}

export type ContactEditStatus = "pending" | "approved" | "rejected";

export interface ContactEditRequest {
  id: string;
  listingId: string;
  listingAddress: string;
  listingNeighborhood: string;
  requesterEmail: string;
  currentContacts: string[];
  requestedContacts: string[];
  currentCapacity?: number;
  requestedCapacity?: number;
  status: ContactEditStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedByEmail?: string;
}
