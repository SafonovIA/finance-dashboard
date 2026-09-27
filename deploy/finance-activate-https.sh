#!/bin/sh
set -eu

domain=safonov.gosha2016.fvds.ru
webroot=/var/www/finance-acme
certificate=/etc/letsencrypt/live/$domain/fullchain.pem
private_key=/etc/letsencrypt/live/$domain/privkey.pem
active_config=/etc/nginx/conf.d/finance-dashboard.conf
desired_config=/opt/finance-dashboard/deploy/firstvds-nginx.conf
backup_config=/etc/nginx/finance-dashboard.before-https
renew_hook=/etc/letsencrypt/renewal-hooks/deploy/finance-nginx.sh

if [ ! -s "$certificate" ] || [ ! -s "$private_key" ]; then
    certbot certonly --webroot -w "$webroot" -d "$domain" \
        --email safonov.gosha2016@yandex.ru \
        --agree-tos --non-interactive --no-eff-email
fi

test -s "$certificate"
test -s "$private_key"
test -f "$active_config"
test -f "$desired_config"

install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
install -m 755 /opt/finance-dashboard/deploy/finance-cert-renew.sh "$renew_hook"

if cmp -s "$desired_config" "$active_config"; then
    exit 0
fi

cp -p "$active_config" "$backup_config"
install -m 644 "$desired_config" "$active_config"
if ! nginx -t || ! systemctl reload nginx; then
    cp -p "$backup_config" "$active_config"
    nginx -t
    systemctl reload nginx
    exit 1
fi
