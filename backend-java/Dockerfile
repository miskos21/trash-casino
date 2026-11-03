FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build
COPY shared-schemas/api.schema.json shared-schemas/api.schema.json
COPY backend-java backend-java
RUN mvn --batch-mode --no-transfer-progress -f backend-java/pom.xml verify

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 raccoon
COPY --from=build /build/backend-java/target/backend-0.1.0-SNAPSHOT.jar app.jar
USER raccoon
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
