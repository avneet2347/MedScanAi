import Tesseract from "tesseract.js";

export const extractText = async (file: Buffer): Promise<string> => {
  const { data } = await Tesseract.recognize(file, "eng");
  return data.text;
};