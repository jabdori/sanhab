# 빌드 컨텍스트 = 프로젝트 루트. 원본 데이터는 include_str!로 바이너리에 포함(경로 ../../01_참가자_배포용/...)
FROM rust:1.97-slim-trixie AS build
WORKDIR /src/app
# 의존성 레이어 캐시: 매니페스트만으로 먼저 빌드
COPY app/Cargo.toml app/Cargo.lock ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release && rm -rf src target/release/deps/w07*
COPY ["01_참가자_배포용/04_원본데이터/00_common/approval_authority_policy.md", "/src/01_참가자_배포용/04_원본데이터/00_common/"]
COPY ["01_참가자_배포용/04_원본데이터/01_corevia/master/m_agency_cv.csv", "/src/01_참가자_배포용/04_원본데이터/01_corevia/master/"]
COPY ["01_참가자_배포용/04_원본데이터/01_corevia/sales/sales_rebate_payment_cv.csv", "/src/01_참가자_배포용/04_원본데이터/01_corevia/sales/"]
COPY ["01_참가자_배포용/04_원본데이터/01_corevia/financials/fin_collection_history_cv.csv", "/src/01_참가자_배포용/04_원본데이터/01_corevia/financials/"]
COPY app/db ./db
COPY app/public ./public
COPY app/src ./src
RUN cargo build --release

# 런타임: 셸·패키지 없는 distroless(glibc 일치: trixie ↔ debian13), 비루트
FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=build /src/app/target/release/w07 /w07
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD ["/w07", "health"]
ENTRYPOINT ["/w07"]
