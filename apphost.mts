import { createBuilder } from "./.aspire/modules/aspire.mjs";

const builder = await createBuilder();

const bifrost = await builder
  .addContainer("bifrost-gateway", "maximhq/bifrost:latest")
  .withVolume("/app/data", { name: "bifrost-gateway-data" })
  .withEnvironment("APP_HOST", "0.0.0.0")
  .withEnvironment("APP_PORT", "8080")
  .withHttpEndpoint({ port: 8080, targetPort: 8080, name: "http" })
  .withExternalHttpEndpoints();

const bifrostEndpoint = await bifrost.getEndpoint("http");

await builder
  .addViteApp("proofreader-web", "./proofreader-web", {
    runScriptName: "dev",
  })
  .publishAsNodeServer("server.mjs", { outputPath: "." })
  .withEnvironment("MODEL_PROVIDER_BASE_URL", `${bifrostEndpoint}/v1`)
  .withEnvironment("MODEL_PROVIDER_MODEL", "openai/gpt-oss-120b")
  .withExternalHttpEndpoints()
  .waitFor(bifrost);

await builder.build().run();
