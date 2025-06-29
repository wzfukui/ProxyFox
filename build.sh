#!/bin/bash

# ProxyFox Chrome Extension Build Script
# This script creates a zip package for Chrome Web Store submission

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from manifest.json
VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": "\([^"]*\)".*/\1/')

echo -e "${BLUE}🦊 ProxyFox Build Script${NC}"
echo -e "${BLUE}========================${NC}"
echo -e "Version: ${GREEN}${VERSION}${NC}"
echo ""

# Create dist directory if it doesn't exist
mkdir -p dist

# Define the output filename
OUTPUT_FILE="dist/proxyfox-v${VERSION}.zip"

# Check if file already exists
if [ -f "$OUTPUT_FILE" ]; then
    echo -e "${YELLOW}⚠️  Warning: ${OUTPUT_FILE} already exists${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Build cancelled${NC}"
        exit 1
    fi
    rm "$OUTPUT_FILE"
fi

echo -e "${BLUE}📦 Creating Chrome extension package...${NC}"

# Files and directories to include in the package
INCLUDE_FILES=(
    "manifest.json"
    "popup.html"
    "options.html"
    "_locales"
    "css"
    "js" 
    "images"
)

# Files and directories to exclude
EXCLUDE_PATTERNS=(
    "*.DS_Store"
    "*.git*"
    "*.md"
    "*.txt"
    "LICENSE"
    "build.sh"
    "test_comments.html"
    "CLAUDE.md"
    "dist"
    "images/*.webp"
    "images/*.jpg"
)

# Create temporary directory for building
TEMP_DIR=$(mktemp -d)
BUILD_DIR="${TEMP_DIR}/proxyfox"

echo -e "${BLUE}📋 Copying files to build directory...${NC}"

# Create build directory
mkdir -p "$BUILD_DIR"

# Copy included files
for item in "${INCLUDE_FILES[@]}"; do
    if [ -e "$item" ]; then
        echo "  ✓ Including: $item"
        cp -r "$item" "$BUILD_DIR/"
    else
        echo -e "  ${YELLOW}⚠️  Warning: $item not found${NC}"
    fi
done

# Remove excluded files/patterns from build directory
echo -e "${BLUE}🧹 Cleaning up excluded files...${NC}"

for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    # Use find to locate and remove files matching the pattern
    find "$BUILD_DIR" -name "$pattern" -type f -delete 2>/dev/null || true
    find "$BUILD_DIR" -name "$pattern" -type d -exec rm -rf {} + 2>/dev/null || true
done

# Specifically remove .jpg and .webp files from images directory
find "$BUILD_DIR/images" -name "*.jpg" -delete 2>/dev/null || true
find "$BUILD_DIR/images" -name "*.webp" -delete 2>/dev/null || true

# Create the zip file
echo -e "${BLUE}🗜️  Creating zip archive...${NC}"
ORIGINAL_DIR=$(pwd)
cd "$TEMP_DIR"
zip -r "${ORIGINAL_DIR}/${OUTPUT_FILE}" proxyfox/ > /dev/null

# Get back to original directory
cd "$ORIGINAL_DIR"

# Clean up temporary directory
rm -rf "$TEMP_DIR"

# Check if zip was created successfully
if [ -f "$OUTPUT_FILE" ]; then
    FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo ""
    echo -e "${GREEN}✅ Build completed successfully!${NC}"
    echo -e "📦 Package: ${GREEN}${OUTPUT_FILE}${NC}"
    echo -e "📏 Size: ${GREEN}${FILE_SIZE}${NC}"
    echo ""
    
    # Show package contents
    echo -e "${BLUE}📋 Package contents:${NC}"
    unzip -l "$OUTPUT_FILE" | head -20
    
    if [ $(unzip -l "$OUTPUT_FILE" | wc -l) -gt 25 ]; then
        echo "..."
        echo -e "${YELLOW}(showing first 20 items, use 'unzip -l $OUTPUT_FILE' to see all)${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}🚀 Ready for Chrome Web Store submission!${NC}"
    echo -e "Upload: ${BLUE}https://chrome.google.com/webstore/devconsole${NC}"
    
else
    echo -e "${RED}❌ Build failed! Zip file was not created.${NC}"
    exit 1
fi