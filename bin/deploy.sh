#!/bin/bash

set -e

# Generate
hugo

# Upload
rsync -avz --chown www-data:www-data public/ root@xeon.yadutaf.fr:/var/www/blog.yadutaf.fr
