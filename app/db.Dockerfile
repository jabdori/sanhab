# AXHub의 볼륨은 root 소유로 붙는다. SurrealDB 공식 이미지는 비루트(65532)로 실행되어 /data에 쓰지 못한다(Permission denied).
# 그래서 같은 이미지를 root로 실행한다. 바깥에 포트를 열지 않는 내부 서비스다.
FROM surrealdb/surrealdb:v4.0.1
USER root
