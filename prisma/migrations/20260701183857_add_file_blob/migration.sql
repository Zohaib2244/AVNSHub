-- CreateTable
CREATE TABLE "FileBlob" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
