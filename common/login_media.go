package common

import "path/filepath"

// Login panel media (looping GIF/video) uploaded from the admin settings.
// Files live under LoginMediaDir() and are served at /uploads/*.

const loginMediaUploadPrefix = "/uploads/"

// LoginMediaMaxSize is the upper bound for a login panel media upload.
const LoginMediaMaxSize = 50 << 20 // 50 MB

// LoginMediaAllowedExts lists the accepted file extensions.
var LoginMediaAllowedExts = map[string]bool{
	".mp4":  true,
	".webm": true,
	".gif":  true,
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".webp": true,
	".svg":  true,
}

// LoginMediaDir returns the directory where login panel media is stored.
// The path is relative to the working directory: the container WORKDIR is
// /data, so files land on the persistent ./data volume.
func LoginMediaDir() string {
	return filepath.Join(".", "uploads")
}

// IsLoginMediaUploadURL reports whether the given option value points at a
// file managed by the login media upload flow.
func IsLoginMediaUploadURL(value string) bool {
	return len(value) >= len(loginMediaUploadPrefix) && value[:len(loginMediaUploadPrefix)] == loginMediaUploadPrefix
}

// LoginMediaFilePath maps an /uploads/... URL to its on-disk location.
func LoginMediaFilePath(url string) string {
	return filepath.Join(LoginMediaDir(), filepath.Clean("/"+url[len(loginMediaUploadPrefix):]))
}
