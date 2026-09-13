-- Add Sales AI as a subscription tier in its own migration so PostgreSQL can safely use it in following migrations.
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'SALES_AI';
