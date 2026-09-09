"""
catalog/services/reviews.py — Business service for customer product reviews,
verified purchase validation, rating recalculation, and vendor replies (Sprint 14).
"""
from decimal import Decimal
from typing import List, Optional
from django.db import transaction
from django.db.models import Avg, Count
from rest_framework.exceptions import ValidationError

from catalog.models import (
    Product,
    Review,
    ReviewMedia,
    ReviewReply,
    ReviewModerationStatus,
    ProductQuestion,
    ProductAnswer,
)
from orders.models import OrderItem, OrderItemFulfilmentStatus


class ReviewService:
    @classmethod
    def create_review(
        cls,
        product: Product,
        user,
        rating: int,
        title: str,
        comment: str,
        order_item_id: Optional[str] = None,
        media_urls: Optional[List[str]] = None,
    ) -> Review:
        """
        Creates a customer product review.
        Validates order_item for verified purchase badge and 1-per-item constraint.
        """
        if not (1 <= int(rating) <= 5):
            raise ValidationError({"rating": "Rating must be an integer between 1 and 5."})

        is_verified = False
        order_item = None

        if order_item_id:
            order_item = OrderItem.objects.filter(id=order_item_id).select_related(
                "vendor_order__order", "variant__product"
            ).first()

            if not order_item:
                raise ValidationError({"order_item_id": "Order item not found."})

            if order_item.vendor_order.order.customer != user:
                raise ValidationError({"order_item_id": "Order item does not belong to your account."})

            if order_item.variant.product != product:
                raise ValidationError({"order_item_id": "Order item is not for this product."})

            if order_item.fulfilment_status != OrderItemFulfilmentStatus.DELIVERED:
                raise ValidationError({"order_item_id": "You can only review delivered items."})

            if Review.objects.filter(order_item=order_item).exists():
                raise ValidationError({"order_item_id": "You have already submitted a review for this order item."})

            is_verified = True

        with transaction.atomic():
            review = Review.objects.create(
                product=product,
                user=user,
                order_item=order_item,
                rating=rating,
                title=title,
                comment=comment,
                is_verified_purchase=is_verified,
                moderation_status=ReviewModerationStatus.APPROVED,
            )

            if media_urls:
                for url in media_urls:
                    if url:
                        ReviewMedia.objects.create(
                            review=review,
                            media_url=url,
                            media_type="image",
                        )

            cls.recalculate_product_ratings(product.id)

        return review

    @classmethod
    def moderate_review(cls, review: Review, status: str) -> Review:
        """
        Updates review moderation status and recalculates ratings.
        """
        if status not in ReviewModerationStatus.values:
            raise ValidationError({"moderation_status": f"Invalid status '{status}'."})

        review.moderation_status = status
        review.save(update_fields=["moderation_status", "updated_at"])
        cls.recalculate_product_ratings(review.product_id)
        return review

    @classmethod
    def reply_to_review(cls, review: Review, vendor_staff, comment: str) -> ReviewReply:
        """
        Submits official vendor staff reply to a review.
        """
        if not comment:
            raise ValidationError({"comment": "Reply comment is required."})

        if hasattr(review, "reply"):
            raise ValidationError({"review": "A vendor reply already exists for this review."})

        return ReviewReply.objects.create(
            review=review,
            vendor_staff=vendor_staff,
            comment=comment,
        )

    @classmethod
    def recalculate_product_ratings(cls, product_id) -> None:
        """
        Aggregates approved reviews and updates Product denormalized rating fields.
        """
        approved_reviews = Review.objects.filter(
            product_id=product_id,
            moderation_status=ReviewModerationStatus.APPROVED,
        )
        agg = approved_reviews.aggregate(avg=Avg("rating"), count=Count("id"))

        avg_val = agg["avg"] or Decimal("0.00")
        count_val = agg["count"] or 0

        Product.objects.filter(id=product_id).update(
            rating_avg=Decimal(str(avg_val)).quantize(Decimal("0.01")),
            rating_count=count_val,
        )


review_service = ReviewService()
