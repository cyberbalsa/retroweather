# Rebuilding ws4kp Assets

`app/src/main/assets/ws4kp/` is not tracked in git (excluded via .gitignore). To rebuild after cloning:

    cd /tmp && git clone https://github.com/netbymatt/ws4kp.git
    cd ws4kp && npm install && npm run build
    cp -r dist/. /path/to/weatherstartv/app/src/main/assets/ws4kp/
