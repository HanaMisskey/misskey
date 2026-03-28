#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Generating certificates for cluster.test ==="

# Root CA
openssl genrsa -out certificates/rootCA.key 4096 2>/dev/null
openssl req -x509 -new -nodes -key certificates/rootCA.key -sha256 -days 3650 \
  -out certificates/rootCA.crt -subj "/CN=Multipart Test Root CA" 2>/dev/null

# cluster.test certificate
openssl genrsa -out certificates/cluster.test.key 2048 2>/dev/null
openssl req -new -key certificates/cluster.test.key \
  -out certificates/cluster.test.csr -subj "/CN=cluster.test" 2>/dev/null
openssl x509 -req -in certificates/cluster.test.csr \
  -CA certificates/rootCA.crt -CAkey certificates/rootCA.key -CAcreateserial \
  -out certificates/cluster.test.crt -days 3650 -sha256 \
  -extfile <(printf "subjectAltName=DNS:cluster.test") 2>/dev/null
rm -f certificates/cluster.test.csr certificates/rootCA.srl

echo "=== Generating Misskey config ==="
cp .config/example.default.yml .config/cluster.default.yml

echo "=== Done ==="
