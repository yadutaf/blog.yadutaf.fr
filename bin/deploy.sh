#!/bin/bash

ssh root@xeon.yadutaf.fr -- mkdir -m 0755 -p /var/www
rsync -avz --chown www-data:www-data public/ root@xeon.yadutaf.fr:/var/www/blog.yadutaf.fr

