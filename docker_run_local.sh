docker rm -f jadeai

docker rmi twwch/jadeai:latest

docker run -d --name jadeai --platform linux/amd64 -p 3003:3000 -e AUTH_SECRET=l/UrZGNHj5a7EK4Uw6zu8/sBWxkRE6RcGRweGAX1Z5U= -v ./jadeai-data:/app/data twwch/jadeai:latest