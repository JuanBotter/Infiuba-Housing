export type Lang = "en" | "es";

export type ReviewSource = "survey" | "web";

export interface Review {
  id: string;
  source: ReviewSource;
  year?: number;
  rating?: number;
  recommended?: boolean;
  comment?: string;
  studentContact?: string;
  studentName?: string;
  semester?: string;
  createdAt: string;
}

export interface Listing {
  id: string;
  address: string;
  neighborhood: string;
  contacts: string[];
  priceUsd?: number;
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
  recommended: boolean;
  comment: string;
  semester?: string;
  studentName?: string;
  studentEmail?: string;
  createdAt: string;
}

export interface ApprovedWebReview extends PendingWebReview {
  approvedAt: string;
}
