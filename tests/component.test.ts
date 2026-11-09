import { spawnSync } from "node:child_process";
import nunjucks from "nunjucks";
import camelCase from "lodash.camelcase";
import upperFirst from "lodash.upperfirst";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const renderNunjucksComponent = (component: string, context: unknown) => {
  const stringContext = JSON.stringify(context, undefined, "  ");

  const env = nunjucks.configure("node_modules/govuk-frontend/dist", {
    trimBlocks: true,
    lstripBlocks: true,
  });

  // Overwrite `indent` filter to avoid whitespace differences in tests.
  env.addFilter("indent", (str: string) => str);

  const normalisedCompoenentName = upperFirst(camelCase(component));

  const njk = env.renderString(
    `{% from "govuk/components/${component}/macro.njk" import govuk${normalisedCompoenentName} %}{{ govuk${normalisedCompoenentName}(${stringContext}) }}`,
    {},
  );

  // In Twig: ' escapes to &#039. In Nunjucks: ' escapes to &#039.
  return njk.replaceAll("&#39", "&#039");
};

const renderTwigComponent = (component: string, context: unknown) => {
  const { stdout, status } = spawnSync(
    "php",
    [`${__dirname}/renderTwig.php`, component],
    { input: JSON.stringify(context) },
  );

  if (status !== 0) {
    throw new Error(stdout.toString());
  }

  // In Nunjucks: \ escapes to &#92. In Twig backslashes are not escaped.
  return stdout.toString().replaceAll("\\", "&#92;");
};

describe.each(globalThis.components)(
  "Nunjucks output HTML should match Twig output HTML",
  (componentFixture) => {
    describe.each(componentFixture.fixtures)(
      `${componentFixture.component}`,
      (fixture) => {
        it(`${fixture.name} with ${JSON.stringify(fixture.options)}`, () => {
          const njk = renderNunjucksComponent(
            componentFixture.component,
            fixture.options,
          );
          const twig = renderTwigComponent(
            componentFixture.component,
            fixture.options,
          );

          expect(twig).toEqual(njk);
        });
      },
    );
  },
);

// Upstream fixtures have no special characters in attribute values, so check
// escaping explicitly against the Nunjucks output.
const attributeEscapingFixtures = [
  {
    name: "attribute value containing a double quote",
    component: "button",
    options: {
      text: "Save",
      attributes: { "data-test": '"><script>alert(1)</script>' },
    },
  },
  {
    name: "attribute value containing ampersands and angle brackets",
    component: "button",
    options: {
      text: "Save",
      attributes: { title: "Tom & Jerry <3 'quotes'" },
    },
  },
  {
    name: "attribute name containing special characters",
    component: "button",
    options: {
      text: "Save",
      attributes: { 'data-x"onmouseover="alert(1)': "value" },
    },
  },
  {
    name: "attribute value as options object containing a double quote",
    component: "button",
    options: {
      text: "Save",
      attributes: {
        "data-test": { value: '" autofocus onfocus="alert(1)', optional: true },
      },
    },
  },
  {
    name: "form group attributes containing special characters",
    component: "character-count",
    options: {
      name: "more-detail",
      label: { text: "More detail" },
      maxlength: 10,
      formGroup: {
        attributes: {
          "data-test": '"><script>alert(1)</script>',
          'data-x"onmouseover="alert(1)': "value",
        },
      },
    },
  },
  {
    name: "form group attributes containing special characters",
    component: "password-input",
    options: {
      name: "password",
      label: { text: "Password" },
      formGroup: {
        attributes: {
          "data-test": '"><script>alert(1)</script>',
          'data-x"onmouseover="alert(1)': "value",
        },
      },
    },
  },
];

describe("attribute escaping", () => {
  it.each(attributeEscapingFixtures)(
    "$component: $name",
    ({ component, options }) => {
      const njk = renderNunjucksComponent(component, options);
      const twig = renderTwigComponent(component, options);

      expect(twig).toEqual(njk);
      expect(twig).not.toContain("<script>");
    },
  );
});

// Options the upstream fixtures don't exercise.
const extraFixtures = [
  {
    name: "form group attributes",
    component: "password-input",
    options: {
      name: "password",
      label: { text: "Password" },
      formGroup: { attributes: { "data-test": "value" } },
    },
  },
  {
    name: "form group afterInput html",
    component: "password-input",
    options: {
      name: "password",
      label: { text: "Password" },
      formGroup: { afterInput: { html: "  <b>After</b> input  " } },
    },
  },
];

describe("extra fixtures", () => {
  it.each(extraFixtures)("$component: $name", ({ component, options }) => {
    const njk = renderNunjucksComponent(component, options);
    const twig = renderTwigComponent(component, options);

    expect(twig).toEqual(njk);
  });
});
