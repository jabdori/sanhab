//! 티켓 목록. 티켓마다 `tickets/tNN_이름.rs` 한 파일을 만들고 아래 목록에 한 줄을 더한다(이 파일은 합칠 때 양쪽 줄을 모두 남긴다: app/.gitattributes).
//! 티켓 파일이 내놓는 것: `SCHEMA`(app/db/NN-이름.surql), `routes()`(/api 아래, 접속한 역할만), `seed()`(초기화 때 적재), `check()`(자동 검사).
use crate::check::Check;
use crate::db::Db;
use anyhow::{Context, Result};
use axum::Router;

pub use t01_base::ROLES;

macro_rules! tickets {
    ($($m:ident,)*) => {
        $(mod $m;)*
        pub const SCHEMAS: &[&str] = &[$($m::SCHEMA),*];
        pub fn routes() -> Router<Db> { Router::new()$(.merge($m::routes()))* }
        pub async fn seed(db: &Db) -> Result<()> { $($m::seed(db).await.context(stringify!($m))?;)* Ok(()) }
        /// 티켓마다 초기화한 뒤 검사한다. `only`가 있으면 이름이 그것으로 시작하는 티켓만.
        pub async fn check(c: &mut Check, only: Option<&str>) -> Result<()> {
            $(if only.is_none_or(|o| stringify!($m).starts_with(o)) {
                c.reset().await?;
                $m::check(c).await.context(stringify!($m))?;
                println!("{} OK", stringify!($m));
            })*
            Ok(())
        }
    };
}

tickets! {
    t01_base,
    t02_dealer,
    t03_related,
    t04_review,
    t05_approver,
    t07_pay,
}
