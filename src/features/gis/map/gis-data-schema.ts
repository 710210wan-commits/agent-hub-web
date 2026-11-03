import { z } from "zod";

const longitudeSchema = z.number().min(-180).max(180);
const latitudeSchema = z.number().min(-90).max(90);
const coordinateSchema = z.tuple([longitudeSchema, latitudeSchema]);

const bboxSchema = z.object({
  west: longitudeSchema,
  south: latitudeSchema,
  east: longitudeSchema,
  north: latitudeSchema,
}).refine(
  (bbox) => bbox.west <= bbox.east && bbox.south <= bbox.north,
  { message: "Invalid geographic bounds" },
);

const entitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(["ship", "aircraft", "base", "fire", "earthquake"]),
  coordinates: coordinateSchema,
  importance: z.enum(["high", "medium", "low"]),
  status: z.enum(["normal", "warning", "danger"]),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  altitude: z.number().optional(),
  dataSource: z.string().optional(),
  color: z.string().optional(),
  size: z.number().positive().max(40).optional(),
});

const trajectorySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(["route", "communication", "warning"]),
  coordinates: z.array(coordinateSchema).min(2),
  timestamps: z.array(z.number()).optional(),
  status: z.enum(["realtime", "history"]),
});

const regionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(["control", "monitor", "service"]),
  coordinates: z.array(coordinateSchema).min(3),
  rules: z.string().optional(),
  style: z.object({
    fill: z.boolean().optional(),
    fillColor: z.string().optional(),
    outlineColor: z.string().optional(),
    outlineWidth: z.number().nonnegative().optional(),
    effect: z.enum(["lightWall"]).optional(),
  }).optional(),
  label: z.object({
    text: z.string(),
    position: coordinateSchema.optional(),
  }).optional(),
});

const imageOverlaySchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  rectangle: bboxSchema,
  alpha: z.number().min(0).max(1).optional(),
  tileWidth: z.number().positive().optional(),
  tileHeight: z.number().positive().optional(),
  outlineColor: z.string().optional(),
});

const windFieldSchema = z.object({
  bbox: bboxSchema,
  grid: z.object({
    rows: z.number().int().positive(),
    cols: z.number().int().positive(),
  }),
  u: z.array(z.number()),
  v: z.array(z.number()),
  speed: z.array(z.number().nonnegative()),
  timestamp: z.string().optional(),
  source: z.enum(["open-meteo", "mock-fallback", "fire-mock"]),
}).superRefine((windField, context) => {
  const size = windField.grid.rows * windField.grid.cols;
  for (const key of ["u", "v", "speed"] as const) {
    if (windField[key].length !== size) {
      context.addIssue({
        code: "custom",
        path: ["windField", key],
        message: `${key} length must equal rows × cols`,
      });
    }
  }
});

const cameraViewSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fit-bbox"),
    bbox: bboxSchema,
    padding: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("point"),
    lng: longitudeSchema,
    lat: latitudeSchema,
    altitude: z.number().positive(),
  }),
]);

export const gisDataSchema = z.object({
  type: z.enum(["entity", "trajectory", "region", "image", "wind-field"]),
  coordinates: coordinateSchema.optional(),
  entities: z.array(entitySchema).optional(),
  trajectories: z.array(trajectorySchema).optional(),
  regions: z.array(regionSchema).optional(),
  imageOverlays: z.array(imageOverlaySchema).optional(),
  windField: windFieldSchema.optional(),
  cameraView: cameraViewSchema.optional(),
  eventId: z.string().optional(),
  eventName: z.string().optional(),
  highlightDurationMs: z.number().int().positive().optional(),
  transientRegionIds: z.array(z.string()).optional(),
  transientEntityIds: z.array(z.string()).optional(),
});

export type ValidatedGisData = z.infer<typeof gisDataSchema>;
