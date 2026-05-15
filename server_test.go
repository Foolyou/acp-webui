package main

import (
	"strings"
	"testing"
)

func TestPromptBlocksFromRequestValidatesImages(t *testing.T) {
	blocks, err := promptBlocksFromRequest("hello", []MessageContentBlock{{
		Type:     "image",
		MimeType: "image/png",
		Data:     "iVBORw0KGgo=",
		Name:     stringPtr("image.png"),
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(blocks) != 2 {
		t.Fatalf("blocks = %#v", blocks)
	}

	_, err = promptBlocksFromRequest("", []MessageContentBlock{{
		Type:     "image",
		MimeType: "image/svg+xml",
		Data:     "PHN2Zy8+",
	}})
	if err == nil || !strings.Contains(err.Error(), "Unsupported image type") {
		t.Fatalf("error = %v", err)
	}
}
