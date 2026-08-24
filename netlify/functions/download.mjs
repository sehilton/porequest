import { getStore } from "@netlify/blobs";

export const config = { path: "/api/download/:filename" };

export default async (req, context) => {
  var filename = context.params && context.params.filename;

  if (!filename || filename.indexOf("/") !== -1 || filename.indexOf("..") !== -1) {
    return new Response(JSON.stringify({ error: "Invalid filename" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  var store = getStore("uploads");
  var data;
  try {
    data = await store.get(filename, { type: "arrayBuffer" });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Could not read file" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!data) {
    return new Response(JSON.stringify({ error: "File not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="' + filename + '"'
    }
  });
};
