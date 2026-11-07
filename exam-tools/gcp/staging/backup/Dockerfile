# Backup sidecar: gsutil/gcloud from cloud-sdk + Postgres 18 clients from official image.
# Avoids PGDG apt on google/cloud-sdk:slim (often fails with exit 100 / unsupported suite).
FROM postgres:18.6 AS pg

# Collect client shared libraries so binaries run on the cloud-sdk base (any arch).
# Explicitly include libpq (and its deps): ldd alone can miss versioned sonames
# depending on linker search order on the builder.
RUN mkdir -p /tmp/pg-libs \
    && for bin in pg_dump pg_restore pg_isready; do \
         ldd "/usr/lib/postgresql/18/bin/${bin}" \
           | awk '/=>/ && $3 ~ /^\// { print $3 }' \
           | while read -r lib; do \
               case "${lib}" in \
                 */libc.so*|*/libm.so*|*/libdl.so*|*/libpthread.so*|*/libresolv.so*|*/ld-linux*) continue ;; \
               esac; \
               cp -anL "${lib}" /tmp/pg-libs/ 2>/dev/null || true; \
             done; \
       done \
    && find /usr/lib -name 'libpq.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libldap*.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'liblber*.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libsasl2.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libgssapi_krb5.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libkrb5.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libk5crypto.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libkrb5support.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libkeyutils.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libssl.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && find /usr/lib -name 'libcrypto.so*' -exec cp -anL {} /tmp/pg-libs/ \; \
    && ls -la /tmp/pg-libs

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

COPY --from=pg /usr/lib/postgresql/18/bin/pg_dump /usr/local/lib/pg/bin/pg_dump
COPY --from=pg /usr/lib/postgresql/18/bin/pg_restore /usr/local/lib/pg/bin/pg_restore
COPY --from=pg /usr/lib/postgresql/18/bin/pg_isready /usr/local/lib/pg/bin/pg_isready
COPY --from=pg /tmp/pg-libs/ /usr/local/lib/pg/

# Wrappers so only pg clients see Postgres libs — never set global
# LD_LIBRARY_PATH (it breaks supercronic / gcloud via mismatched libssl).
RUN for cmd in pg_dump pg_restore pg_isready; do \
      printf '%s\n' '#!/bin/sh' \
        'export LD_LIBRARY_PATH=/usr/local/lib/pg${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}' \
        "exec /usr/local/lib/pg/bin/${cmd} \"\$@\"" \
        > "/usr/local/bin/${cmd}" \
      && chmod +x "/usr/local/bin/${cmd}" "/usr/local/lib/pg/bin/${cmd}"; \
    done \
    && pg_isready --version \
    && pg_dump --version

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
