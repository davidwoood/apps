import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, FormField, Text, TextInput } from 'grommet';
import { User } from '../common/models/user';
import routes from './routes';
import { Formik } from 'formik';

interface RegisterProps {
  onSubmit: (values: any) => void;
}

class RegisterForm extends React.Component<RegisterProps> {

  onSubmit = values => {
    this.props.onSubmit(values as User);
  };

  render() {
    const user = new User();
    return (
      <Box align="center" justify="center">
        <Box
          width="medium"
          background="white"
          border="all"
          margin="medium"
          pad="medium"
        >
          <Formik
            initialValues={user}
            validate={values => {
              const errors = {};
              // Parse Values and do errors
              return errors;
            }}

            onSubmit={(values) => {
              this.onSubmit(values);
            }}
          >
            {
              ({
                 values,
                 errors,
                 handleChange,
                 handleSubmit,
               }) => (
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    handleSubmit();
                  }}
                >

                  <Box gap="small">

                    <FormField
                      label="Email"
                      error={errors.email}
                    >
                      <TextInput
                        name="email"
                        value={values.email || ''}
                        onChange={handleChange}
                      />
                    </FormField>


                    <FormField
                      label="Password"
                      error={errors.password}
                    >
                      <TextInput
                        type="password"
                        name="password"
                        value={values.password || ''}
                        onChange={handleChange}
                      />
                    </FormField>


                    <Text>
                      Already registered?{' '}
                      <Link to={routes.index}>Log in</Link>
                    </Text>
                    <Box direction="row" height="50px">
                      <Button
                        type="submit"
                        primary
                        label="Register"
                        fill={true}
                      />
                    </Box>
                  </Box>
                </form>
              )
            }
          </Formik>
        </Box>
      </Box>
    );
  }
}

export default RegisterForm;
