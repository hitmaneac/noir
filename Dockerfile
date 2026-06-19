# The Green Book — pure static site (zero build step). nginx just serves the
# noir/ files; the host's nginx proxies skalamax.si/noir → this container.
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
