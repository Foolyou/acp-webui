use std::path::Path;

fn main() {
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_EMBEDDED_FRONTEND");
    println!("cargo:rerun-if-changed=frontend/dist");

    if std::env::var_os("CARGO_FEATURE_EMBEDDED_FRONTEND").is_some()
        && !Path::new("frontend/dist/index.html").is_file()
    {
        panic!(
            "embedded frontend build requires frontend/dist/index.html; run `cd frontend && npm run build` before building with --features embedded-frontend"
        );
    }
}
