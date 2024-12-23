import express from "express";
import { expressMiddleware } from "@apollo/server/express4";
import createApolloGraphQLServer from "./graphql/index";
import cors from "cors";

// Service Layers
import UserService from "./services/user";
import { JsonWebTokenError } from "jsonwebtoken";

async function initExpressApp() {
  const app = express();

  app.use(express.json());
  app.use(cors());

  app.use(
    "/graphql",
    expressMiddleware(await createApolloGraphQLServer(), {
      context: async ({ req }) => {
        const authHeader = req.headers["authorization"];
        const token = authHeader?.split(" ")[1];

        // console.log("token -", token);

        try {
          return {
            user: token ? await UserService.decodeJwtToken(token) : null,
          };
        } catch (err) {
          if (err instanceof JsonWebTokenError) {
            return { user: null };
          } else {
            throw err;
          }
        }
      },
    })
  );

  return app;
}

export default initExpressApp;
