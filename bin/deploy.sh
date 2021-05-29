#!/bin/bash

set -e

# Generate
rm -rf ./public
hugo

# Upload
rsync -avz --delete --chown www-data:www-data public/ root@xeon.yadutaf.fr:/var/www/blog.yadutaf.fr
