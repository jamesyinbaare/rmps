# Backup sidecar: gsutil/gcloud from cloud-sdk + Postgres 18 clients from official image.
# Avoids PGDG apt on google/cloud-sdk:slim (often fails with exit 100 / unsupported suite).
FROM postgres:18.6 AS pg

# Collect client shared libraries so binaries run on the cloud-sdk base (any arch).
RUN mkdir -p /tmp/pg-libs \
    && for bin in pg_dump pg_restore pg_isready; do \
         ldd "/usr/lib/postgresql/18/bin/${bin}" \
           | awk '/=>/ && $3 ~ /^\// { print $3 }' \
           | while read -r lib; do \
               cp -an "${lib}" /tmp/pg-libs/ 2>/dev/null || true; \
             done; \
       done

FROM google/cloud-sdk:slim

ARG SUPERCRONIC_VERSION=v0.2.33
ARG SUPERCRONIC_SHA256=feefa310da569c81b99e1027b86b27b51e6ee9ab647747b49099645120cfc671

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        python3 \
        util-linux \
    && curl -fsSL -o /usr/local/bin/supercronic \
        "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && echo "${SUPERCRONIC_SHA256}  /usr/local/bin/supercronic" | sha256sum -c - \
    && chmod +x /usr/local/bin/supercronic \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=pg /usr/lib/postgresql/18/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=pg /usr/lib/postgresql/18/bin/pg_restore /usr/local/bin/pg_restore
COPY --from=pg /usr/lib/postgresql/18/bin/pg_isready /usr/local/bin/pg_isready
COPY --from=pg /tmp/pg-libs/ /usr/local/lib/pg/

ENV LD_LIBRARY_PATH=/usr/local/lib/pg

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh \
    && ldconfig /usr/local/lib/pg 2>/dev/null || true

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
