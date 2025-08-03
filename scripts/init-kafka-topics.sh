#!/bin/bash

# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
sleep 30

# Kafka broker connection string
KAFKA_BROKERS="kafka1:9092,kafka2:9092,kafka3:9092"

# Create topics with appropriate configurations
echo "Creating Kafka topics..."

# System queue - single partition for ordered processing
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.system \
  --partitions 1 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# DB queue - single partition for ordered processing
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.db \
  --partitions 1 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# Deliver queue - partitioned by domain for parallel processing
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.deliver \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# Inbox queue - partitioned by domain for parallel processing
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.inbox \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# Relationship queue - partitioned by user ID
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.relationship \
  --partitions 6 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# Object Storage queue
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.objectStorage \
  --partitions 3 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# Ended Poll Notification queue
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.endedPollNotification \
  --partitions 1 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# User Webhook Deliver queue
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.userWebhookDeliver \
  --partitions 3 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# System Webhook Deliver queue
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic misskey.systemWebhookDeliver \
  --partitions 1 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config segment.ms=86400000 \
  --if-not-exists

# Dead Letter Queues for each main queue
for queue in system db deliver inbox relationship objectStorage endedPollNotification userWebhookDeliver systemWebhookDeliver; do
  kafka-topics.sh --create \
    --bootstrap-server $KAFKA_BROKERS \
    --topic misskey.$queue.dlq \
    --partitions 1 \
    --replication-factor 3 \
    --config retention.ms=2592000000 \
    --if-not-exists
done

echo "Topic creation complete. Listing topics:"
kafka-topics.sh --list --bootstrap-server $KAFKA_BROKERS