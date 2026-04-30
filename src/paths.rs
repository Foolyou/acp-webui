use std::path::Path;

pub fn native_path_string(path: impl AsRef<Path>) -> String {
    let path = path.as_ref().to_string_lossy();
    strip_windows_verbatim_prefix(&path)
}

fn strip_windows_verbatim_prefix(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::native_path_string;

    #[test]
    fn native_path_string_removes_windows_verbatim_disk_prefix() {
        assert_eq!(
            native_path_string(r"\\?\C:\workspaces\project"),
            r"C:\workspaces\project"
        );
    }

    #[test]
    fn native_path_string_removes_windows_verbatim_unc_prefix() {
        assert_eq!(
            native_path_string(r"\\?\UNC\server\share\project"),
            r"\\server\share\project"
        );
    }

    #[test]
    fn native_path_string_preserves_regular_paths() {
        assert_eq!(
            native_path_string(r"C:\workspaces\project"),
            r"C:\workspaces\project"
        );
        assert_eq!(native_path_string("/tmp/project"), "/tmp/project");
    }
}
