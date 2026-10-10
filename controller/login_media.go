package controller

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
	"github.com/gin-gonic/gin"
)

// UploadLoginMedia stores a login panel media file (looping GIF/video or a
// static image) and returns its public URL. The LoginPanelMedia option is
// updated separately through the generic option API.
func UploadLoginMedia(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "file is required")
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !common.LoginMediaAllowedExts[ext] {
		common.ApiErrorMsg(c, "unsupported file type: "+ext)
		return
	}
	if fileHeader.Size > common.LoginMediaMaxSize {
		common.ApiErrorMsg(c, "file exceeds the 50 MB limit")
		return
	}

	if err := os.MkdirAll(common.LoginMediaDir(), os.ModePerm); err != nil {
		common.ApiError(c, err)
		return
	}
	// Server-generated name only: the client never controls the stored path.
	fileName := "login-media-" + uuid.New().String() + ext
	savePath := filepath.Join(common.LoginMediaDir(), fileName)
	if err := c.SaveUploadedFile(fileHeader, savePath); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"url": "/uploads/" + fileName})
}

// DeleteLoginMediaFile removes the file backing an /uploads/... URL. It is
// called when the LoginPanelMedia option changes so replaced media does not
// accumulate on disk. Non-upload URLs are ignored.
func DeleteLoginMediaFile(mediaURL string) {
	if mediaURL == "" || !common.IsLoginMediaUploadURL(mediaURL) {
		return
	}
	if err := os.Remove(common.LoginMediaFilePath(mediaURL)); err != nil && !os.IsNotExist(err) {
		common.SysLog("failed to delete login media file " + mediaURL + ": " + err.Error())
	}
}
